"use client";
import { useCallback, useEffect, useState } from "react";

export type GeoStatus = "idle" | "prompting" | "granted" | "denied" | "unavailable" | "error";

export interface GeoCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface GeoState {
  status: GeoStatus;
  coords: GeoCoords | null;
  error: string | null;
  request: () => void;
}

export function useGeolocation(autoRequest = false): GeoState {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setError("Geolocation not supported by this browser");
      return;
    }
    setStatus("prompting");
    setError(null);
    const onSuccess = (pos: GeolocationPosition) => {
      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
      setStatus("granted");
    };
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setStatus("denied");
        setError(err.message);
      } else {
        // Fallback: try low-accuracy with a longer timeout and accept cached fix.
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (e2) => {
            if (e2.code === e2.PERMISSION_DENIED) setStatus("denied");
            else setStatus("error");
            setError(e2.message);
          },
          { enableHighAccuracy: false, timeout: 30000, maximumAge: 5 * 60_000 },
        );
      }
    };
    // First try: fast, allow a recent cached fix so we don't wait for GPS at all.
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 10 * 60_000,
    });
  }, []);

  useEffect(() => {
    if (autoRequest) request();
  }, [autoRequest, request]);

  return { status, coords, error, request };
}
