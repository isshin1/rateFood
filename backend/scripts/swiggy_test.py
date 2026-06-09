"""One-off probe: can we still hit Swiggy's public JSON endpoints from plain httpx in 2026?

Run: `cd backend && uv run python -m scripts.swiggy_test`

Outputs:
  - HTTP status + first-byte snippet for each endpoint
  - Parsed restaurants (name, rating, id) for Kanpur
  - For the first 2 restaurants, parsed dishes (name, price, category)

If we see Cloudflare/DataDome challenges (HTML instead of JSON, 403/451/503),
stop here — escalate to Playwright in the next pass.
"""

import asyncio
import json
import random
import sys
from typing import Any

import httpx

# Kanpur city centre (Google: 26.4499°N, 80.3319°E)
CITY = "Kanpur"
LAT = 26.4499
LNG = 80.3319

LIST_URL = "https://www.swiggy.com/dapi/restaurants/list/v5"
MENU_URL = "https://www.swiggy.com/dapi/menu/pl"

# Browser-y headers — mimic a real Chrome session
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.swiggy.com/",
    "Origin": "https://www.swiggy.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Linux"',
}


def _snippet(text: str, n: int = 300) -> str:
    return text[:n].replace("\n", " ")


def _is_json(resp: httpx.Response) -> bool:
    return "application/json" in resp.headers.get("content-type", "").lower()


def _looks_like_challenge(resp: httpx.Response) -> bool:
    body = resp.text[:2000].lower()
    return any(
        s in body
        for s in (
            "cloudflare",
            "datadome",
            "akamai",
            "challenge",
            "captcha",
            "attention required",
        )
    )


async def fetch_restaurants(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    params = {"lat": LAT, "lng": LNG, "page_type": "DESKTOP_WEB_LISTING"}
    r = await client.get(LIST_URL, params=params, headers=HEADERS, timeout=20)
    print(f"\n[LIST] {r.status_code} {r.headers.get('content-type', '?')}")
    if r.status_code != 200 or not _is_json(r):
        print(f"[LIST] non-JSON body snippet: {_snippet(r.text)}")
        if _looks_like_challenge(r):
            print("[LIST] !! looks like a bot challenge !!")
        return []

    data = r.json()
    # Swiggy buries restaurants several levels deep; walk cards looking for any
    # node containing a `restaurants` array. Robust to minor schema shuffles.
    restaurants: list[dict[str, Any]] = []
    cards = (data.get("data") or {}).get("cards") or []
    print(f"[LIST] top-level cards: {len(cards)}")

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if "restaurants" in node and isinstance(node["restaurants"], list):
                for r_ in node["restaurants"]:
                    info = r_.get("info") if isinstance(r_, dict) else None
                    if info:
                        restaurants.append(info)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(cards)
    return restaurants


async def fetch_menu(client: httpx.AsyncClient, restaurant_id: str) -> list[dict[str, Any]]:
    params = {
        "page-type": "REGULAR_MENU",
        "complete-menu": "true",
        "lat": LAT,
        "lng": LNG,
        "restaurantId": restaurant_id,
    }
    r = await client.get(MENU_URL, params=params, headers=HEADERS, timeout=20)
    print(f"\n[MENU {restaurant_id}] {r.status_code} {r.headers.get('content-type', '?')}")
    if r.status_code != 200 or not _is_json(r):
        print(f"[MENU] non-JSON body snippet: {_snippet(r.text)}")
        if _looks_like_challenge(r):
            print("[MENU] !! looks like a bot challenge !!")
        return []

    data = r.json()
    items: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            # food items are usually `{ "card": { "info": { "name", "price"/"defaultPrice", "category", "description", "imageId" } } }`
            card = node.get("card")
            if isinstance(card, dict):
                info = card.get("info")
                if isinstance(info, dict) and (
                    "price" in info or "defaultPrice" in info
                ) and "name" in info:
                    items.append(info)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(data)
    # dedupe by id (Swiggy may repeat items across categories)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for it in items:
        iid = str(it.get("id") or it.get("itemId") or it.get("name"))
        if iid in seen:
            continue
        seen.add(iid)
        unique.append(it)
    return unique


async def main() -> None:
    async with httpx.AsyncClient(http2=False, follow_redirects=True) as client:
        # warm cookies by hitting the home page first
        warm = await client.get("https://www.swiggy.com/", headers=HEADERS, timeout=20)
        print(f"[WARMUP] / -> {warm.status_code}")

        await asyncio.sleep(random.uniform(1.5, 3.0))

        restaurants = await fetch_restaurants(client)
        if not restaurants:
            print("\nNo restaurants extracted — aborting.")
            sys.exit(1)

        print(f"\n=== Got {len(restaurants)} restaurants in {CITY} ===")
        for r in restaurants[:10]:
            print(
                f"  - id={r.get('id'):>10}  "
                f"rating={str(r.get('avgRating')):>4}  "
                f"votes={r.get('totalRatingsString', '?'):>10}  "
                f"area={r.get('areaName', '?')[:25]:25}  "
                f"name={r.get('name', '?')[:40]}"
            )

        sample = restaurants[:2]
        for r in sample:
            await asyncio.sleep(random.uniform(2.0, 4.0))
            items = await fetch_menu(client, str(r["id"]))
            print(f"\n=== Menu for [{r['name']}] — {len(items)} items ===")
            for it in items[:15]:
                price_paise = it.get("price") or it.get("defaultPrice") or 0
                price_inr = price_paise / 100 if price_paise else 0
                print(
                    f"  - ₹{price_inr:>6.0f}  "
                    f"{(it.get('name') or '?')[:50]:50}  "
                    f"[{(it.get('category') or '?')[:18]:18}]"
                )

        print("\n--- raw shape sample (first restaurant) ---")
        print(json.dumps(restaurants[0], indent=2)[:1500])


if __name__ == "__main__":
    asyncio.run(main())
