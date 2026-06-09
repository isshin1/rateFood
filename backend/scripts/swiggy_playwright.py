"""Tier-2 probe: drive a real Chromium via Playwright to load Swiggy's restaurant
listing for Kanpur and capture as many paginated JSON responses as the page
loads. We don't reverse-engineer pagination — we let the website's own JS do it,
and intercept the XHR responses.

Run: `cd backend && uv run python -m scripts.swiggy_playwright`

Outputs:
  - /tmp/swiggy_pw_raw.json   — every captured JSON response, in order
  - /tmp/swiggy_pw_flat.json  — flattened unique restaurants
  - printed summary table
"""

import asyncio
import json
from typing import Any

from playwright.async_api import Response, async_playwright

CITY = "Kanpur"
LAT = 26.4499
LNG = 80.3319

# URL patterns whose JSON we capture
LIST_PATTERNS = ("dapi/restaurants/list/v5", "dapi/restaurants/list/update")

# Number of scrolls to perform to trigger pagination; stop early if no new data
MAX_SCROLLS = 20
QUIET_SCROLLS_BEFORE_STOP = 3


def _extract_restaurants(payload: Any) -> list[dict[str, Any]]:
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


async def main() -> None:
    captured_pages: list[dict[str, Any]] = []
    all_restaurants: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            viewport={"width": 1366, "height": 900},
            geolocation={"latitude": LAT, "longitude": LNG},
            permissions=["geolocation"],
        )
        page = await context.new_page()

        async def on_response(resp: Response) -> None:
            url = resp.url
            # log every dapi/mapi call so we see what the page actually hits
            if "swiggy.com/dapi" in url or "swiggy.com/mapi" in url:
                ctype = resp.headers.get("content-type", "")
                marker = "[JSON]" if "application/json" in ctype else "[xxx ]"
                print(f"{marker} {resp.status}  {resp.request.method:4}  {url[:120]}")
            if not any(p in url for p in LIST_PATTERNS):
                return
            ctype = resp.headers.get("content-type", "")
            if "application/json" not in ctype:
                return
            try:
                body = await resp.json()
            except Exception:
                return
            captured_pages.append(body)
            new = 0
            for info in _extract_restaurants(body):
                rid = str(info.get("id"))
                if rid not in seen_ids:
                    seen_ids.add(rid)
                    all_restaurants.append(info)
                    new += 1
            if new:
                print(f"  -> +{new} new (total {len(all_restaurants)})")

        page.on("response", on_response)

        # Navigate; Swiggy reads lat/lng from query params and a localStorage entry.
        # We set both for good measure.
        url = f"https://www.swiggy.com/restaurants?lat={LAT}&lng={LNG}"
        print(f"[NAV] {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_timeout(4000)  # let initial XHRs settle

        # Trigger pagination by scrolling; stop after N quiet scrolls (no new data)
        quiet = 0
        last_total = len(all_restaurants)
        for i in range(MAX_SCROLLS):
            await page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
            await page.wait_for_timeout(2500)
            if len(all_restaurants) == last_total:
                quiet += 1
                print(f"  scroll {i + 1}: quiet ({quiet}/{QUIET_SCROLLS_BEFORE_STOP})")
                if quiet >= QUIET_SCROLLS_BEFORE_STOP:
                    print("  no new data; stopping")
                    break
            else:
                quiet = 0
            last_total = len(all_restaurants)

        # final settle
        await page.wait_for_timeout(2000)
        await browser.close()

    with open("/tmp/swiggy_pw_raw.json", "w") as f:
        json.dump(captured_pages, f)
    with open("/tmp/swiggy_pw_flat.json", "w") as f:
        json.dump(all_restaurants, f, indent=2)

    print(
        f"\n=== captured {len(captured_pages)} JSON responses, "
        f"{len(all_restaurants)} unique restaurants ==="
    )

    print(f"\n{'id':>10}  {'rate':>4}  {'votes':>8}  {'area':28}  name")
    print("-" * 110)
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
