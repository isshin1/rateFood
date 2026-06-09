from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status

from app.config import get_settings

_settings = get_settings()

# fields we want from Place Details — billed per field group per New Places API pricing
_FIELD_MASK = (
    "id,displayName,formattedAddress,location,photos.name,addressComponents"
)
_BASE_URL = "https://places.googleapis.com/v1"


@dataclass
class PlaceDetails:
    place_id: str
    name: str
    formatted_address: str
    lat: float
    lng: float
    photo_reference: str | None
    city: str | None


def _city_from_components(components: list[dict]) -> str | None:
    """Extract city from Google's addressComponents. Tries locality, then administrative_area_level_2."""
    by_type: dict[str, str] = {}
    for comp in components:
        for t in comp.get("types", []):
            by_type.setdefault(t, comp.get("longText") or comp.get("shortText", ""))
    return (
        by_type.get("locality")
        or by_type.get("postal_town")
        or by_type.get("administrative_area_level_2")
        or by_type.get("administrative_area_level_1")
    )


_TEXT_SEARCH_URL = f"{_BASE_URL}/places:searchText"
_TEXT_SEARCH_FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,"
    "places.location,places.photos.name,places.addressComponents"
)


async def text_search(
    query: str, lat: float | None = None, lng: float | None = None, radius_m: float = 25000.0
) -> list[PlaceDetails]:
    """Free-text search via Places API (New). Returns up to 20 results, biased to (lat,lng) if given."""
    body: dict = {
        "textQuery": query,
        "includedType": "restaurant",
        "pageSize": 20,
    }
    if lat is not None and lng is not None:
        body["locationBias"] = {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius_m}
        }
    headers = {
        "X-Goog-Api-Key": _settings.google_places_api_key,
        "X-Goog-FieldMask": _TEXT_SEARCH_FIELD_MASK,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(_TEXT_SEARCH_URL, headers=headers, json=body)
    if r.status_code != 200:
        return []
    out: list[PlaceDetails] = []
    for p in r.json().get("places") or []:
        loc = p.get("location") or {}
        photos = p.get("photos") or []
        out.append(
            PlaceDetails(
                place_id=p["id"],
                name=(p.get("displayName") or {}).get("text", ""),
                formatted_address=p.get("formattedAddress", ""),
                lat=float(loc.get("latitude", 0)),
                lng=float(loc.get("longitude", 0)),
                photo_reference=photos[0]["name"] if photos else None,
                city=_city_from_components(p.get("addressComponents", [])),
            )
        )
    return out


async def fetch_place_details(
    place_id: str, session_token: str | None = None
) -> PlaceDetails:
    headers = {
        "X-Goog-Api-Key": _settings.google_places_api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }
    params: dict[str, str] = {}
    if session_token:
        params["sessionToken"] = session_token

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{_BASE_URL}/places/{place_id}", headers=headers, params=params
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"places: {r.status_code} {r.text[:200]}",
        )
    data = r.json()
    loc = data.get("location") or {}
    photos = data.get("photos") or []
    return PlaceDetails(
        place_id=data["id"],
        name=(data.get("displayName") or {}).get("text", ""),
        formatted_address=data.get("formattedAddress", ""),
        lat=float(loc.get("latitude", 0)),
        lng=float(loc.get("longitude", 0)),
        photo_reference=photos[0]["name"] if photos else None,
        city=_city_from_components(data.get("addressComponents", [])),
    )
