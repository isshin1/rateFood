import uuid
from typing import Annotated

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, optional_user
from app.config import get_settings
from app.db import get_session
from app.images import presign_get, put_object
from app.models import Dish, DishFavorite, Restaurant, RestaurantFavorite, User, UserRole
from app.places import fetch_place_details, text_search
from scripts.city_coords import coords_for
from app.restaurants.schemas import (
    CreateDishRequest,
    CreateRestaurantRequest,
    DishResponse,
    NearbyRestaurant,
    Page,
    RestaurantResponse,
)
import math

router = APIRouter(tags=["restaurants"])


# -------- restaurants --------


@router.post("/restaurants", status_code=status.HTTP_201_CREATED)
async def create_restaurant(
    payload: CreateRestaurantRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RestaurantResponse:
    # if a restaurant with this place_id already exists, return it (idempotent)
    existing = (
        await session.execute(select(Restaurant).where(Restaurant.place_id == payload.place_id))
    ).scalar_one_or_none()
    if existing:
        return RestaurantResponse.model_validate(existing)

    details = await fetch_place_details(payload.place_id, payload.session_token)
    restaurant = Restaurant(
        place_id=details.place_id,
        name=details.name,
        formatted_address=details.formatted_address,
        lat=details.lat,
        lng=details.lng,
        photo_reference=details.photo_reference,
        city=details.city,
        description=payload.description,
        cuisine=payload.cuisine,
        tags=payload.tags,
        created_by=user.id,
    )
    session.add(restaurant)
    try:
        await session.commit()
    except IntegrityError:
        # race: another request just inserted the same place_id
        await session.rollback()
        restaurant = (
            await session.execute(
                select(Restaurant).where(Restaurant.place_id == payload.place_id)
            )
        ).scalar_one()
    else:
        await session.refresh(restaurant)
    return RestaurantResponse.model_validate(restaurant)


_SYSTEM_EMAIL = "system@ratefood.local"


async def _system_user_id(session: AsyncSession) -> uuid.UUID | None:
    return (
        await session.execute(select(User.id).where(User.email == _SYSTEM_EMAIL))
    ).scalar_one_or_none()


async def _ingest_from_text_search(
    session: AsyncSession, city: str, query: str
) -> list[Restaurant]:
    """Live-search Google Places for `{query} in {city}`, upsert results, return all matched rows
    (whether newly inserted or pre-existing) in Google's relevance order."""
    coords = coords_for(city)
    if not coords:
        return []
    lat, lng = coords
    sys_id = await _system_user_id(session)
    if sys_id is None:
        return []
    hits = await text_search(f"{query} in {city}", lat=lat, lng=lng, radius_m=25000.0)
    if not hits:
        return []
    place_ids = [h.place_id for h in hits]
    existing = {
        r.place_id: r
        for r in (
            await session.execute(select(Restaurant).where(Restaurant.place_id.in_(place_ids)))
        ).scalars().all()
    }
    new_rows: list[Restaurant] = []
    for h in hits:
        if h.place_id in existing:
            continue
        row = Restaurant(
            place_id=h.place_id,
            name=h.name,
            formatted_address=h.formatted_address,
            lat=h.lat,
            lng=h.lng,
            photo_reference=h.photo_reference,
            city=h.city or city,
            cuisine=None,
            tags=[],
            created_by=sys_id,
        )
        session.add(row)
        new_rows.append(row)
    if new_rows:
        try:
            await session.commit()
            for r in new_rows:
                await session.refresh(r)
        except IntegrityError:
            await session.rollback()
            return list(existing.values())
    # preserve Google's relevance order
    merged_by_pid = {r.place_id: r for r in (*existing.values(), *new_rows)}
    return [merged_by_pid[pid] for pid in place_ids if pid in merged_by_pid]


async def _favourite_ids_for(
    session: AsyncSession, user: User | None, restaurant_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    if user is None or not restaurant_ids:
        return set()
    rows = (
        await session.execute(
            select(RestaurantFavorite.restaurant_id).where(
                RestaurantFavorite.user_id == user.id,
                RestaurantFavorite.restaurant_id.in_(restaurant_ids),
            )
        )
    ).scalars().all()
    return set(rows)


def _to_response(r: Restaurant, fav_ids: set[uuid.UUID]) -> RestaurantResponse:
    payload = RestaurantResponse.model_validate(r)
    payload.is_favourite = r.id in fav_ids
    return payload


@router.get("/restaurants")
async def list_restaurants(
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User | None, Depends(optional_user)] = None,
    city: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query(description="substring match on name")] = None,
    page: Annotated[int, Query(ge=0)] = 0,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[RestaurantResponse]:
    def _build_stmts(name_query: str | None):
        stmt = select(Restaurant)
        count_stmt = select(func.count()).select_from(Restaurant)
        if city:
            stmt = stmt.where(func.lower(Restaurant.city) == city.lower())
            count_stmt = count_stmt.where(func.lower(Restaurant.city) == city.lower())
        if name_query:
            stmt = stmt.where(Restaurant.name.ilike(f"%{name_query}%"))
            count_stmt = count_stmt.where(Restaurant.name.ilike(f"%{name_query}%"))
        stmt = stmt.order_by(Restaurant.created_at.desc()).offset(page * size).limit(size)
        return stmt, count_stmt

    stmt, count_stmt = _build_stmts(q)
    items = (await session.execute(stmt)).scalars().all()
    total = (await session.execute(count_stmt)).scalar_one()

    # On-demand ingest: if the user searched for something we don't have, ask Google.
    # Only on first page, only with a query, only when local turned up nothing — keeps
    # API costs bounded and avoids re-querying for the same misses (the upsert grows the
    # catalogue, so a re-search of the same q comes back from DB next time).
    if q and city and total == 0 and page == 0:
        google_rows = await _ingest_from_text_search(session, city, q)
        if google_rows:
            items = google_rows[:size]
            total = len(google_rows)

    fav_ids = await _favourite_ids_for(session, user, [r.id for r in items])
    return Page[RestaurantResponse](
        items=[_to_response(r, fav_ids) for r in items],
        total=total,
        page=page,
        size=size,
    )


# -------- nearby (radial map view) --------


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _bearing_deg(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


@router.get("/restaurants/nearby")
async def restaurants_nearby(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User | None, Depends(optional_user)] = None,
    radius_km: Annotated[float, Query(gt=0, le=50)] = 10.0,
    limit: Annotated[int, Query(ge=1, le=200)] = 60,
) -> list[NearbyRestaurant]:
    # Cheap bounding box prefilter, exact filter after.
    deg_lat = radius_km / 111.0
    deg_lng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    stmt = select(Restaurant).where(
        Restaurant.lat.between(lat - deg_lat, lat + deg_lat),
        Restaurant.lng.between(lng - deg_lng, lng + deg_lng),
    )
    rows = (await session.execute(stmt)).scalars().all()

    enriched: list[tuple[Restaurant, float, float]] = []
    for r in rows:
        d = _haversine_km(lat, lng, r.lat, r.lng)
        if d <= radius_km:
            enriched.append((r, d, _bearing_deg(lat, lng, r.lat, r.lng)))
    enriched.sort(key=lambda t: t[1])
    enriched = enriched[:limit]

    fav_ids = await _favourite_ids_for(session, user, [r.id for r, _, _ in enriched])
    return [
        NearbyRestaurant(
            id=r.id,
            name=r.name,
            formatted_address=r.formatted_address,
            lat=r.lat,
            lng=r.lng,
            photo_reference=r.photo_reference,
            cuisine=r.cuisine,
            tags=r.tags,
            favorite_count=r.favorite_count,
            is_favourite=r.id in fav_ids,
            distance_km=round(d, 3),
            bearing_deg=round(b, 2),
        )
        for r, d, b in enriched
    ]


# -------- favourites --------


@router.get("/favorites/restaurants")
async def list_favorite_restaurants(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    city: Annotated[str | None, Query()] = None,
) -> list[RestaurantResponse]:
    stmt = (
        select(Restaurant)
        .join(RestaurantFavorite, RestaurantFavorite.restaurant_id == Restaurant.id)
        .where(RestaurantFavorite.user_id == user.id)
        .order_by(RestaurantFavorite.created_at.desc())
    )
    if city:
        stmt = stmt.where(func.lower(Restaurant.city) == city.lower())
    items = (await session.execute(stmt)).scalars().all()
    fav_ids = {r.id for r in items}
    return [_to_response(r, fav_ids) for r in items]


@router.post("/restaurants/{restaurant_id}/favorite", status_code=status.HTTP_201_CREATED)
async def add_favorite(
    restaurant_id: uuid.UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RestaurantResponse:
    r = await session.get(Restaurant, restaurant_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    session.add(RestaurantFavorite(user_id=user.id, restaurant_id=restaurant_id))
    try:
        await session.flush()
        r.favorite_count = (r.favorite_count or 0) + 1
        await session.commit()
    except IntegrityError:
        # already favourited — idempotent
        await session.rollback()
    await session.refresh(r)
    return _to_response(r, {r.id})


@router.delete("/restaurants/{restaurant_id}/favorite")
async def remove_favorite(
    restaurant_id: uuid.UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RestaurantResponse:
    r = await session.get(Restaurant, restaurant_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    fav = (
        await session.execute(
            select(RestaurantFavorite).where(
                RestaurantFavorite.user_id == user.id,
                RestaurantFavorite.restaurant_id == restaurant_id,
            )
        )
    ).scalar_one_or_none()
    if fav is not None:
        await session.delete(fav)
        r.favorite_count = max(0, (r.favorite_count or 0) - 1)
        await session.commit()
        await session.refresh(r)
    return _to_response(r, set())


# Resolved googleusercontent URLs are valid ~1h. Cache in Redis to avoid hammering Places per page-load.
_PHOTO_TTL_S = 3000  # 50 min, comfortably inside Google's URL validity window
_photo_redis: aioredis.Redis | None = None


def _photo_cache() -> aioredis.Redis:
    global _photo_redis
    if _photo_redis is None:
        _photo_redis = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _photo_redis


@router.get("/restaurants/{restaurant_id}/photo")
async def restaurant_photo(
    restaurant_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    w: Annotated[int, Query(ge=64, le=1600)] = 600,
) -> RedirectResponse:
    r = await session.get(Restaurant, restaurant_id)
    if r is None or not r.photo_reference:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    cache = _photo_cache()
    cache_key = f"places:photo:{r.photo_reference}:{w}"
    # Browser cache for as long as the upstream URL is valid; matches Redis TTL.
    browser_headers = {"Cache-Control": f"public, max-age={_PHOTO_TTL_S}"}

    cached_uri = await cache.get(cache_key)
    if cached_uri:
        return RedirectResponse(cached_uri, status_code=307, headers=browser_headers)

    settings = get_settings()
    url = f"https://places.googleapis.com/v1/{r.photo_reference}/media"
    params = {
        "key": settings.google_places_api_key,
        "maxWidthPx": w,
        "skipHttpRedirect": "true",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params)
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="photo unavailable")
    photo_uri = resp.json().get("photoUri")
    if not photo_uri:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="no photoUri in response")
    await cache.setex(cache_key, _PHOTO_TTL_S, photo_uri)
    return RedirectResponse(photo_uri, status_code=307, headers=browser_headers)


@router.get("/restaurants/{restaurant_id}")
async def get_restaurant(
    restaurant_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User | None, Depends(optional_user)] = None,
) -> RestaurantResponse:
    r = await session.get(Restaurant, restaurant_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    fav_ids = await _favourite_ids_for(session, user, [r.id])
    return _to_response(r, fav_ids)


@router.delete("/restaurants/{restaurant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_restaurant(
    restaurant_id: uuid.UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    r = await session.get(Restaurant, restaurant_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if r.created_by != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    await session.delete(r)
    await session.commit()


# -------- dishes --------


async def _dish_fav_ids_for(
    session: AsyncSession, user: User | None, dish_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    if user is None or not dish_ids:
        return set()
    rows = (
        await session.execute(
            select(DishFavorite.dish_id).where(
                DishFavorite.user_id == user.id,
                DishFavorite.dish_id.in_(dish_ids),
            )
        )
    ).scalars().all()
    return set(rows)


def _dish_to_response(
    d: Dish, fav_ids: set[uuid.UUID], restaurant_name: str | None = None
) -> DishResponse:
    payload = DishResponse.model_validate(d)
    payload.is_favourite = d.id in fav_ids
    if restaurant_name is not None:
        payload.restaurant_name = restaurant_name
    return payload


@router.post(
    "/restaurants/{restaurant_id}/dishes", status_code=status.HTTP_201_CREATED
)
async def create_dish(
    restaurant_id: uuid.UUID,
    payload: CreateDishRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    auto_favorite: Annotated[bool, Query(description="favourite dish + restaurant after create")] = False,
) -> DishResponse:
    restaurant = await session.get(Restaurant, restaurant_id)
    if restaurant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="restaurant not found")
    # Snapshot identifiers/values up-front into plain Python types so subsequent
    # commits don't force a lazy attribute reload (which would 500 in asyncpg).
    restaurant_name = restaurant.name
    user_id = user.id
    dish = Dish(
        restaurant_id=restaurant_id,
        name=payload.name,
        description=payload.description,
        tags=payload.tags,
        created_by=user_id,
    )
    session.add(dish)
    await session.commit()
    await session.refresh(dish)
    dish_id = dish.id

    if auto_favorite:
        # idempotent: ignore if either is already favourited
        session.add(DishFavorite(user_id=user_id, dish_id=dish_id))
        try:
            await session.flush()
            dish.favorite_count = (dish.favorite_count or 0) + 1
            await session.commit()
        except IntegrityError:
            await session.rollback()

        # re-fetch restaurant in case its row state advanced
        restaurant = await session.get(Restaurant, restaurant_id)
        session.add(RestaurantFavorite(user_id=user_id, restaurant_id=restaurant_id))
        try:
            await session.flush()
            if restaurant is not None:
                restaurant.favorite_count = (restaurant.favorite_count or 0) + 1
            await session.commit()
        except IntegrityError:
            await session.rollback()
        await session.refresh(dish)

    # Pass primitives, not ORM attribute accesses.
    fav_rows = (
        await session.execute(
            select(DishFavorite.dish_id).where(
                DishFavorite.user_id == user_id,
                DishFavorite.dish_id == dish_id,
            )
        )
    ).scalars().all()
    fav_ids = set(fav_rows)
    return _dish_to_response(dish, fav_ids, restaurant_name=restaurant_name)


@router.get("/restaurants/{restaurant_id}/dishes")
async def list_dishes_for_restaurant(
    restaurant_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User | None, Depends(optional_user)] = None,
) -> list[DishResponse]:
    items = (
        await session.execute(
            select(Dish).where(Dish.restaurant_id == restaurant_id).order_by(Dish.created_at.desc())
        )
    ).scalars().all()
    fav_ids = await _dish_fav_ids_for(session, user, [d.id for d in items])
    return [_dish_to_response(d, fav_ids) for d in items]


@router.get("/dishes")
async def list_dishes(
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User | None, Depends(optional_user)] = None,
    city: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=0)] = 0,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[DishResponse]:
    stmt = select(Dish, Restaurant.name).join(Restaurant)
    count_stmt = select(func.count()).select_from(Dish).join(Restaurant)
    if city:
        stmt = stmt.where(func.lower(Restaurant.city) == city.lower())
        count_stmt = count_stmt.where(func.lower(Restaurant.city) == city.lower())
    if q:
        stmt = stmt.where(Dish.name.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(Dish.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Dish.created_at.desc()).offset(page * size).limit(size)
    rows = (await session.execute(stmt)).all()
    items = [(d, name) for d, name in rows]
    total = (await session.execute(count_stmt)).scalar_one()
    fav_ids = await _dish_fav_ids_for(session, user, [d.id for d, _ in items])
    return Page[DishResponse](
        items=[_dish_to_response(d, fav_ids, restaurant_name=name) for d, name in items],
        total=total,
        page=page,
        size=size,
    )


@router.get("/favorites/dishes")
async def list_favorite_dishes(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    city: Annotated[str | None, Query()] = None,
) -> list[DishResponse]:
    stmt = (
        select(Dish, Restaurant.name)
        .join(Restaurant)
        .join(DishFavorite, DishFavorite.dish_id == Dish.id)
        .where(DishFavorite.user_id == user.id)
        .order_by(DishFavorite.created_at.desc())
    )
    if city:
        stmt = stmt.where(func.lower(Restaurant.city) == city.lower())
    rows = (await session.execute(stmt)).all()
    fav_ids = {d.id for d, _ in rows}
    return [_dish_to_response(d, fav_ids, restaurant_name=name) for d, name in rows]


@router.post("/dishes/{dish_id}/favorite", status_code=status.HTTP_201_CREATED)
async def add_dish_favorite(
    dish_id: uuid.UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DishResponse:
    d = await session.get(Dish, dish_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    session.add(DishFavorite(user_id=user.id, dish_id=dish_id))
    try:
        await session.flush()
        d.favorite_count = (d.favorite_count or 0) + 1
        await session.commit()
    except IntegrityError:
        await session.rollback()
    await session.refresh(d)
    return _dish_to_response(d, {d.id})


@router.delete("/dishes/{dish_id}/favorite")
async def remove_dish_favorite(
    dish_id: uuid.UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DishResponse:
    d = await session.get(Dish, dish_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    fav = (
        await session.execute(
            select(DishFavorite).where(
                DishFavorite.user_id == user.id, DishFavorite.dish_id == dish_id
            )
        )
    ).scalar_one_or_none()
    if fav is not None:
        await session.delete(fav)
        d.favorite_count = max(0, (d.favorite_count or 0) - 1)
        await session.commit()
        await session.refresh(d)
    return _dish_to_response(d, set())


@router.get("/dishes/{dish_id}")
async def get_dish(
    dish_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User | None, Depends(optional_user)] = None,
) -> DishResponse:
    d = await session.get(Dish, dish_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    fav_ids = await _dish_fav_ids_for(session, user, [d.id])
    return _dish_to_response(d, fav_ids)


# -------- dish images (MinIO upload + Unsplash fallback) --------

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MiB


_CSE_URL = "https://www.googleapis.com/customsearch/v1"
# Resolved URLs are stable web images; cache for a long time, the lookup is paid.
_DISH_FALLBACK_TTL_S = 7 * 24 * 3600


async def _stock_photo_fallback_url(dish: Dish, session: AsyncSession, w: int) -> str | None:
    """Google Custom Search image fallback. Returns a stable web image URL for the dish,
    cached in Redis so we don't pay per page-load. Returns None if CSE isn't configured
    or the search returns nothing — caller should 404 or use a placeholder."""
    settings = get_settings()
    if not settings.google_cse_id:
        return None

    cache = _photo_cache()
    cache_key = f"dish:img:{dish.id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    restaurant = await session.get(Restaurant, dish.restaurant_id)
    # Query: dish name + restaurant name + "food" — quoted-ish so CSE keeps phrases together
    parts: list[str] = []
    if dish.name:
        parts.append(dish.name)
    if restaurant and restaurant.name:
        parts.append(restaurant.name)
    parts.append("food")
    query = " ".join(parts)

    params = {
        "key": settings.google_places_api_key,
        "cx": settings.google_cse_id,
        "q": query,
        "searchType": "image",
        "num": 1,
        "safe": "active",
        "imgSize": "MEDIUM",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(_CSE_URL, params=params)
        if r.status_code != 200:
            return None
        items = r.json().get("items") or []
        if not items:
            return None
        url = items[0].get("link")
        if not url:
            return None
    except Exception:
        return None

    await cache.setex(cache_key, _DISH_FALLBACK_TTL_S, url)
    return url


@router.post("/dishes/{dish_id}/image", status_code=status.HTTP_200_OK)
async def upload_dish_image(
    dish_id: uuid.UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File()],
) -> DishResponse:
    d = await session.get(Dish, dish_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if d.created_by != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"unsupported type {file.content_type}",
        )
    data = await file.read()
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="image > 5 MiB",
        )
    ext = (file.content_type or "image/jpeg").split("/")[-1]
    key = f"dishes/{dish_id}.{ext}"
    await put_object(key, data, file.content_type or "image/jpeg")
    d.image_key = key
    await session.commit()
    await session.refresh(d)
    fav_ids = await _dish_fav_ids_for(session, user, [d.id])
    return _dish_to_response(d, fav_ids)


@router.get("/dishes/{dish_id}/image")
async def get_dish_image(
    dish_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    w: Annotated[int, Query(ge=64, le=1600)] = 400,
) -> RedirectResponse:
    d = await session.get(Dish, dish_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    # User upload first, Unsplash stock photo as fallback.
    if d.image_key:
        url = await presign_get(d.image_key, expires_seconds=3000)
        return RedirectResponse(url, status_code=307, headers={"Cache-Control": "public, max-age=3000"})
    fallback = await _stock_photo_fallback_url(d, session, w)
    if fallback is None:
        # No CSE configured or no result — return a tiny transparent placeholder
        # so the <img> doesn't show the broken-image icon in the grid.
        placeholder = "https://via.placeholder.com/400x264/eeeeee/aaaaaa?text=No+photo"
        return RedirectResponse(placeholder, status_code=307, headers={"Cache-Control": "public, max-age=600"})
    return RedirectResponse(fallback, status_code=307, headers={"Cache-Control": "public, max-age=3000"})


@router.delete("/dishes/{dish_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dish(
    dish_id: uuid.UUID,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    d = await session.get(Dish, dish_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if d.created_by != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    await session.delete(d)
    await session.commit()
