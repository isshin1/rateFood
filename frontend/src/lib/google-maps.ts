import { isMajorIndianCity, stateOfCity } from "@/lib/cities-india";

declare global {
  interface Window {
    google?: any;
    __gmaps_loading?: Promise<void>;
  }
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__gmaps_loading) return window.__gmaps_loading;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY missing"));
  }

  window.__gmaps_loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&v=weekly`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load Google Maps JS"));
    document.head.appendChild(s);
  });
  return window.__gmaps_loading;
}

export interface RestaurantPrediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

/**
 * Predict restaurants. Uses the legacy AutocompleteService for predictions only
 * (no Place Details billing here — that happens server-side on selection).
 * If `cityBias` is set, results are biased to that city's viewport AND post-filtered
 * to drop predictions whose address doesn't contain the city name.
 */
export async function predictRestaurants(
  input: string,
  sessionToken: any,
  cityBias?: string,
): Promise<RestaurantPrediction[]> {
  if (!input.trim()) return [];
  await loadGoogleMaps();
  const svc = new window.google.maps.places.AutocompleteService();

  let bounds: any = null;
  if (cityBias) {
    bounds = await geocodeCity(cityBias);
  }

  const req: any = {
    input,
    // omit `types` — narrow types like "restaurant" filter out many real food places
    // (cafés, dhabas, food courts) that Google tags differently.
    componentRestrictions: { country: "in" },
    sessionToken,
  };
  if (bounds) {
    req.bounds = bounds;
    req.strictBounds = true;
  }

  const expectedState = cityBias ? stateOfCity(cityBias)?.toLowerCase() : undefined;
  const expectedCityLower = cityBias?.toLowerCase();

  return new Promise<RestaurantPrediction[]>((resolve) => {
    svc.getPlacePredictions(req, (predictions: any[] | null, status: string) => {
      if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
        resolve([]);
        return;
      }
      const out: RestaurantPrediction[] = [];
      for (const p of predictions) {
        const main = p.structured_formatting?.main_text ?? p.description;
        const secondary = p.structured_formatting?.secondary_text ?? "";
        if (cityBias) {
          const blob = `${main} ${secondary}`.toLowerCase();
          // accept if the prediction mentions either the city or its state
          const inCity = expectedCityLower && blob.includes(expectedCityLower);
          const inState = expectedState && blob.includes(expectedState);
          if (!inCity && !inState) continue;
        }
        out.push({ placeId: p.place_id, mainText: main, secondaryText: secondary });
      }
      resolve(out);
    });
  });
}

async function geocodeCity(city: string): Promise<any | null> {
  await loadGoogleMaps();
  const geocoder = new window.google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode(
      { address: `${city}, India`, componentRestrictions: { country: "IN" } },
      (results: any[] | null, status: string) => {
        if (status !== "OK" || !results?.[0]) {
          resolve(null);
          return;
        }
        const g = results[0].geometry;
        resolve(g?.viewport ?? g?.bounds ?? null);
      },
    );
  });
}

export interface CityPrediction {
  /** What to show in the dropdown — e.g. "Kanpur — Uttar Pradesh, India". Unique within a result set. */
  label: string;
  /** Canonical city name to store/filter by — e.g. "Kanpur". Matches Google's locality used for restaurants. */
  value: string;
}

/**
 * Fetch city predictions for an input string. Cheap — uses AutocompleteService
 * (no Place Details billing).
 */
export async function predictCities(input: string): Promise<CityPrediction[]> {
  if (!input.trim()) return [];
  await loadGoogleMaps();
  const svc = new window.google.maps.places.AutocompleteService();
  return new Promise<CityPrediction[]>((resolve) => {
    svc.getPlacePredictions(
      { input, types: ["locality"], componentRestrictions: { country: "in" } },
      (predictions: any[] | null, status: string) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
          resolve([]);
          return;
        }
        // Dedupe by city name — Google may return multiple entries (e.g. Kanpur/UP and
        // tiny villages also named Kanpur in other states). The first hit per name is
        // Google's most-prominent, which matches what's in our major-cities whitelist.
        const seen = new Set<string>();
        const out: CityPrediction[] = [];
        for (const p of predictions) {
          const main = p.structured_formatting?.main_text ?? p.description;
          if (!isMajorIndianCity(main)) continue;
          const key = main.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const secondary = p.structured_formatting?.secondary_text ?? "";
          const label = secondary ? `${main} — ${secondary}` : main;
          out.push({ label, value: main });
        }
        resolve(out);
      },
    );
  });
}
