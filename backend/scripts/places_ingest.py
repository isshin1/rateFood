"""Seed the restaurants table with popular places per city via Google Places Text Search.

Run:
  cd backend && uv run python -m scripts.places_ingest --city Kanpur
  cd backend && uv run python -m scripts.places_ingest --all
  cd backend && uv run python -m scripts.places_ingest --city Kanpur --dry-run

Notes:
- Uses Places API (New) — POST places.googleapis.com/v1/places:searchText
- Up to 60 results per city (3 pages of 20, paginated via nextPageToken)
- Idempotent: upserts by place_id; existing rows are left alone
- Restaurants are owned by a system user (system@ratefood.local) so they're
  distinguishable from user-added places via `created_by`
"""

import argparse
import asyncio
import uuid
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.auth.security import hash_password
from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app.models import Restaurant, User, UserRole
from scripts.city_coords import CITIES, coords_for

SYSTEM_EMAIL = "system@ratefood.local"
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,places.location,"
    "places.photos.name,places.addressComponents,nextPageToken"
)
RADIUS_M = 8000.0  # ~8km from city centre — covers most of a typical Indian metro core
PAGE_SIZE = 20  # max per page
MAX_PAGES = 3  # New Places API caps at 60 total (3 × 20)


def _city_from_components(components: list[dict[str, Any]]) -> str | None:
    by_type: dict[str, str] = {}
    for comp in components:
        for t in comp.get("types", []):
            by_type.setdefault(t, comp.get("longText") or comp.get("shortText", ""))
    return (
        by_type.get("locality")
        or by_type.get("postal_town")
        or by_type.get("administrative_area_level_2")
    )


async def _ensure_system_user(session) -> uuid.UUID:
    user = (
        await session.execute(select(User).where(User.email == SYSTEM_EMAIL))
    ).scalar_one_or_none()
    if user:
        return user.id
    user = User(
        first_name="System",
        last_name="Catalogue",
        email=SYSTEM_EMAIL,
        password=hash_password(uuid.uuid4().hex),  # unguessable, never used to sign in
        role=UserRole.ADMIN,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    print(f"  created system user {SYSTEM_EMAIL}")
    return user.id


async def fetch_popular(city: str, lat: float, lng: float) -> list[dict[str, Any]]:
    settings = get_settings()
    headers = {
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": FIELD_MASK,
        "Content-Type": "application/json",
    }
    base_body: dict[str, Any] = {
        "textQuery": f"popular restaurants in {city}",
        "includedType": "restaurant",
        "locationBias": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": RADIUS_M}
        },
        "rankPreference": "RELEVANCE",  # POPULARITY isn't honored with text queries; RELEVANCE + location does the lifting
        "pageSize": PAGE_SIZE,
    }
    results: list[dict[str, Any]] = []
    next_token: str | None = None

    async with httpx.AsyncClient(timeout=20) as client:
        for page in range(MAX_PAGES):
            body = dict(base_body)
            if next_token:
                body["pageToken"] = next_token
            r = await client.post(PLACES_URL, headers=headers, json=body)
            if r.status_code != 200:
                print(f"  [page {page + 1}] HTTP {r.status_code}: {r.text[:300]}")
                break
            data = r.json()
            page_places = data.get("places") or []
            results.extend(page_places)
            print(f"  [page {page + 1}] +{len(page_places)} (total {len(results)})")
            next_token = data.get("nextPageToken")
            if not next_token:
                break
            # New Places API requires a brief delay before nextPageToken is valid
            await asyncio.sleep(2)

    return results


async def ingest_city(city: str, dry_run: bool) -> None:
    coords = coords_for(city)
    if not coords:
        print(f"!! {city}: no coords in city_coords.py — skipping")
        return
    lat, lng = coords
    print(f"\n=== {city} ({lat}, {lng}) ===")
    places = await fetch_popular(city, lat, lng)
    if not places:
        return

    if dry_run:
        for p in places:
            name = (p.get("displayName") or {}).get("text", "?")
            addr = p.get("formattedAddress", "?")
            print(f"  - {name[:40]:40}  {addr[:60]}")
        print(f"  [DRY-RUN] would upsert {len(places)} restaurants")
        return

    async with SessionLocal() as session:
        system_user_id = await _ensure_system_user(session)
        upserted = 0
        skipped = 0
        for p in places:
            place_id = p["id"]
            existing = (
                await session.execute(
                    select(Restaurant.id).where(Restaurant.place_id == place_id)
                )
            ).scalar_one_or_none()
            if existing:
                skipped += 1
                continue
            loc = p.get("location") or {}
            photos = p.get("photos") or []
            session.add(
                Restaurant(
                    place_id=place_id,
                    name=(p.get("displayName") or {}).get("text", ""),
                    formatted_address=p.get("formattedAddress", ""),
                    lat=float(loc.get("latitude", 0)),
                    lng=float(loc.get("longitude", 0)),
                    photo_reference=photos[0]["name"] if photos else None,
                    city=_city_from_components(p.get("addressComponents", [])) or city,
                    cuisine=None,
                    tags=[],
                    created_by=system_user_id,
                )
            )
            upserted += 1
        try:
            await session.commit()
        except IntegrityError as e:
            await session.rollback()
            print(f"  !! integrity error on commit: {e}")
        else:
            print(f"  upserted {upserted}, skipped {skipped} existing")


async def main() -> None:
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--city", help="ingest a single city by name")
    g.add_argument("--all", action="store_true", help="ingest every city in city_coords.py")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # ensure tables exist (no-op if they already do)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if args.city:
        await ingest_city(args.city, args.dry_run)
    else:
        for name, _, _ in CITIES:
            await ingest_city(name, args.dry_run)
            await asyncio.sleep(1)  # be a little kind to Google


if __name__ == "__main__":
    asyncio.run(main())
