"""Probe: pull EVERY page of Swiggy's Kanpur restaurant listing into one JSON file.

Pagination on Swiggy v5: the initial GET returns `pageOffset` containing `nextOffset`
and `widgetOffset` cursors. Subsequent pages are fetched via POST to
`/dapi/restaurants/list/update` with those cursors in the body.

Run: `cd backend && uv run python -m scripts.swiggy_fetch_all`

Outputs:
  - /tmp/swiggy_kanpur_raw.json   — every page's raw JSON, concatenated
  - /tmp/swiggy_kanpur_flat.json  — flattened unique restaurants list
  - prints summary table
"""

import asyncio
import json
import random
from typing import Any

import httpx

from scripts.swiggy_test import HEADERS, fetch_restaurants  # type: ignore

CITY = "Kanpur"
LAT = 26.4499
LNG = 80.3319

LIST_GET = "https://www.swiggy.com/dapi/restaurants/list/v5"
LIST_POST = "https://www.swiggy.com/dapi/restaurants/list/update"

MAX_PAGES = 30  # safety cap


def _extract_restaurants(payload: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if "restaurants" in node and isinstance(node["restaurants"], list):
                for r_ in node["restaurants"]:
                    info = r_.get("info") if isinstance(r_, dict) else None
                    if info:
                        out.append(info)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(payload)
    return out


def _extract_page_offset(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Look for `pageOffset: {nextOffset, widgetOffset}` anywhere in the payload."""
    found: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if "pageOffset" in node and isinstance(node["pageOffset"], dict):
                po = node["pageOffset"]
                if po.get("nextOffset"):
                    found.append(po)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(payload)
    return found[0] if found else None


async def main() -> None:
    all_pages: list[dict[str, Any]] = []
    all_restaurants: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # warmup
        warm = await client.get("https://www.swiggy.com/", headers=HEADERS, timeout=20)
        print(f"[WARMUP] / -> {warm.status_code}")
        await asyncio.sleep(random.uniform(1.5, 3.0))

        # page 1 — GET
        params = {"lat": LAT, "lng": LNG, "page_type": "DESKTOP_WEB_LISTING"}
        r = await client.get(LIST_GET, params=params, headers=HEADERS, timeout=20)
        print(f"[GET page 1] {r.status_code} {r.headers.get('content-type', '?')}")
        if r.status_code != 200 or "application/json" not in r.headers.get("content-type", ""):
            print("page 1 failed; aborting"); return
        page1 = r.json()
        all_pages.append(page1)
        for info in _extract_restaurants(page1):
            if str(info.get("id")) not in seen_ids:
                seen_ids.add(str(info.get("id")))
                all_restaurants.append(info)

        next_offset_obj = _extract_page_offset(page1)
        print(f"[GET page 1] extracted {len(all_restaurants)} restaurants, nextOffset present: {next_offset_obj is not None}")
        if next_offset_obj:
            print(f"  cursor sample: nextOffset={next_offset_obj.get('nextOffset')[:60]}...")

        # subsequent pages — POST with cursor
        page_num = 2
        while next_offset_obj and page_num <= MAX_PAGES:
            await asyncio.sleep(random.uniform(2.0, 4.0))
            body = {
                "lat": LAT,
                "lng": LNG,
                "nextOffset": next_offset_obj.get("nextOffset"),
                "widgetOffset": next_offset_obj.get("widgetOffset") or {},
                "filters": {},
                "seoParams": {
                    "seoUrl": "https://www.swiggy.com/restaurants",
                    "pageType": "FOOD_HOMEPAGE",
                    "apiName": "FoodHomePage",
                },
                "page_type": "DESKTOP_WEB_LISTING",
                "_csrf": "",
            }
            r = await client.post(
                LIST_POST,
                json=body,
                params={"lat": LAT, "lng": LNG, "page-type": "DESKTOP_WEB_LISTING"},
                headers={**HEADERS, "Content-Type": "application/json"},
                timeout=20,
            )
            print(f"[POST page {page_num}] {r.status_code} {r.headers.get('content-type', '?')}")
            if r.status_code != 200 or "application/json" not in r.headers.get("content-type", ""):
                print(f"  body snippet: {r.text[:200]}")
                break
            payload = r.json()
            all_pages.append(payload)
            new_count = 0
            for info in _extract_restaurants(payload):
                rid = str(info.get("id"))
                if rid not in seen_ids:
                    seen_ids.add(rid)
                    all_restaurants.append(info)
                    new_count += 1
            print(f"  +{new_count} new (total {len(all_restaurants)})")
            new_offset = _extract_page_offset(payload)
            # if cursor unchanged, we're done
            if not new_offset or new_offset.get("nextOffset") == next_offset_obj.get("nextOffset"):
                print("  no further cursor; stopping")
                break
            next_offset_obj = new_offset
            page_num += 1

    with open("/tmp/swiggy_kanpur_raw.json", "w") as f:
        json.dump(all_pages, f)
    with open("/tmp/swiggy_kanpur_flat.json", "w") as f:
        json.dump(all_restaurants, f, indent=2)
    print(
        f"\n=== fetched {len(all_pages)} pages, {len(all_restaurants)} unique restaurants ==="
    )

    print(
        f"\n{'id':>10}  {'rate':>4}  {'votes':>8}  {'area':28}  name"
    )
    print("-" * 100)
    for r in all_restaurants:
        print(
            f"{str(r.get('id')):>10}  "
            f"{str(r.get('avgRating', '-')):>4}  "
            f"{str(r.get('totalRatingsString', '?')):>8}  "
            f"{(r.get('areaName', '?') or '?')[:28]:28}  "
            f"{r.get('name', '?')}"
        )


if __name__ == "__main__":
    asyncio.run(main())
