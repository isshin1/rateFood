"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, predictRestaurants, RestaurantPrediction } from "@/lib/google-maps";

export interface PlaceSelection {
  placeId: string;
  sessionToken: string;
  name: string;
  formattedAddress: string;
}

export function PlacesAutocomplete({
  onSelect,
  placeholder = "Search a restaurant…",
  cityBias,
}: {
  onSelect: (p: PlaceSelection) => void;
  placeholder?: string;
  cityBias?: string;
}) {
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<RestaurantPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState<RestaurantPrediction | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !window.google) return;
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        setReady(true);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, []);

  // close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!ready || picked) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setPredictions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const out = await predictRestaurants(query, sessionTokenRef.current, cityBias);
      setPredictions(out);
      setOpen(true);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, cityBias, ready, picked]);

  function handlePick(p: RestaurantPrediction) {
    setPicked(p);
    setQuery(p.mainText);
    setOpen(false);
    onSelect({
      placeId: p.placeId,
      sessionToken: sessionTokenRef.current?.toString?.() ?? "",
      name: p.mainText,
      formattedAddress: p.secondaryText,
    });
    // start a fresh session for any subsequent search
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        disabled={!ready}
        onChange={(e) => {
          setQuery(e.target.value);
          setPicked(null);
        }}
        onFocus={() => predictions.length && setOpen(true)}
        placeholder={
          ready ? (cityBias ? `Search in ${cityBias}…` : placeholder) : "Loading…"
        }
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        autoComplete="off"
      />
      {open && predictions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md max-h-64 overflow-auto">
          {predictions.map((p) => (
            <button
              type="button"
              key={p.placeId}
              onClick={() => handlePick(p)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <div className="font-medium">{p.mainText}</div>
              {p.secondaryText && (
                <div className="text-xs text-muted-foreground">{p.secondaryText}</div>
              )}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && predictions.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md p-3 text-xs text-muted-foreground">
          No restaurants found {cityBias ? `in ${cityBias}` : ""}.
        </div>
      )}
    </div>
  );
}
