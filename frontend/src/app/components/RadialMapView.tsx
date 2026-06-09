"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { fetchWithAuth } from "@/lib/api";
import { Heart, MapPin, Compass } from "lucide-react";
import toast from "react-hot-toast";

const API = process.env.NEXT_PUBLIC_API_URL;

export interface NearbyRestaurant {
  id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  photo_reference: string | null;
  cuisine: string | null;
  tags: string[];
  favorite_count: number;
  is_favourite: boolean;
  distance_km: number;
  bearing_deg: number;
}

interface Props {
  userLat: number;
  userLng: number;
  radiusKm?: number;
  onRadiusChange?: (km: number) => void;
  onClose?: () => void;
}

const MIN_RADIUS = 1;
const MAX_RADIUS = 30;

const PADDING = 56;
const BRANCH_THRESHOLD_KM = 3;
const MAX_ICON = 56;
const MIN_ICON = 22;
// Fixed visual scale: the canvas always shows `BASELINE_KM` from edge to edge.
// Increasing the slider radius fetches restaurants further out — they appear off-screen
// and become reachable via drag, instead of compressing the existing layout.
const BASELINE_KM = 10;

// Hash bearing+id → stable jitter, so the same restaurant always draws the same branch.
function pseudoRand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// Linear distance scale anchored to BASELINE_KM, NOT the user's chosen radius.
// 1km maps to the same pixel offset regardless of slider position.
function placeXY(
  bearing: number,
  distanceKm: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { x: number; y: number } {
  const rad = (bearing * Math.PI) / 180;
  const t = distanceKm / BASELINE_KM;
  return { x: cx + Math.sin(rad) * rx * t, y: cy - Math.cos(rad) * ry * t };
}

function iconSize(d: number, maxD: number): number {
  const t = Math.min(d, maxD) / maxD;
  return Math.round(MAX_ICON - (MAX_ICON - MIN_ICON) * t);
}

// Organic tree-branch path: cubic bezier with two perpendicular wobble points,
// plus 1-2 small leaf-twigs that stick off the trunk.
function branchPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: string,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  // unit perpendicular
  const px = -dy / len;
  const py = dx / len;
  const r1 = pseudoRand(seed + "a");
  const r2 = pseudoRand(seed + "b");
  const r3 = pseudoRand(seed + "c");
  const wob1 = (r1 - 0.5) * len * 0.45;
  const wob2 = (r2 - 0.5) * len * 0.45;
  const c1x = x1 + dx * 0.33 + px * wob1;
  const c1y = y1 + dy * 0.33 + py * wob1;
  const c2x = x1 + dx * 0.66 + px * wob2;
  const c2y = y1 + dy * 0.66 + py * wob2;
  let d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  // tiny twig off c1
  const twigLen = 8 + r3 * 14;
  const tx = c1x + px * twigLen * (r3 > 0.5 ? 1 : -1);
  const ty = c1y + py * twigLen * (r3 > 0.5 ? 1 : -1);
  d += ` M ${c1x} ${c1y} L ${tx} ${ty}`;
  return d;
}

export function RadialMapView({ userLat, userLng, radiusKm = 8, onRadiusChange, onClose }: Props) {
  const [places, setPlaces] = useState<NearbyRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<NearbyRestaurant | null>(null);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [hoveredRestId, setHoveredRestId] = useState<string | null>(null);
  const [dishesByRestaurant, setDishesByRestaurant] = useState<Record<string, { id: string; name: string; image_key: string | null }[]>>({});
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleClearHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredRestId(null), 180);
  };
  const cancelClearHover = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  // Lazy-fetch dishes when a restaurant is hovered.
  // Only cache non-empty results — an empty result might just mean the user
  // hadn't added their dish yet; re-fetch on next hover so newly-added dishes
  // appear without a manual reload.
  useEffect(() => {
    if (!hoveredRestId) return;
    const cached = dishesByRestaurant[hoveredRestId];
    if (cached && cached.length > 0) return;
    let cancelled = false;
    fetchWithAuth(`${API}/restaurants/${hoveredRestId}/dishes?size=8`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any) => {
        if (cancelled) return;
        // Endpoint returns a bare array (list[DishResponse]), not a Page.
        const raw: any[] = Array.isArray(data) ? data : (data?.items ?? []);
        const items = raw.slice(0, 8).map((d) => ({
          id: d.id,
          name: d.name,
          image_key: d.image_key ?? null,
        }));
        if (items.length === 0) return; // don't poison the cache
        setDishesByRestaurant((prev) => ({ ...prev, [hoveredRestId]: items }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hoveredRestId, dishesByRestaurant]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const radiusRef = useRef(radiusKm);
  useEffect(() => { radiusRef.current = radiusKm; }, [radiusKm]);

  // Pan + zoom (visual only — wheel changes zoom, slider changes radius).
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Reset pan + zoom when location/radius change, so a fresh view re-centers.
  useEffect(() => { setPan({ x: 0, y: 0 }); setZoom(1); }, [userLat, userLng, radiusKm]);

  // Track canvas pixel size so we can stretch the radial layout to fill it.
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 800 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setCanvasSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cx = canvasSize.w / 2;
  const cy = canvasSize.h / 2;
  const rx = Math.max(40, canvasSize.w / 2 - PADDING);
  const ry = Math.max(40, canvasSize.h / 2 - PADDING);

  // Wheel: visual zoom only (does NOT change the data radius — slider owns that).
  // Zooms toward the cursor like a normal map. Non-passive to swallow page scroll.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const MIN_ZOOM = 0.4;
    const MAX_ZOOM = 6;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      setZoom((prevZ) => {
        const nextZ = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZ * factor));
        if (nextZ === prevZ) return prevZ;
        const ratio = nextZ / prevZ;
        setPan((prevP) => ({
          x: mx - (mx - prevP.x) * ratio,
          y: my - (my - prevP.y) * ratio,
        }));
        return nextZ;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchWithAuth(
      `${API}/restaurants/nearby?lat=${userLat}&lng=${userLng}&radius_km=${radiusKm}&limit=80`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`nearby fetch failed: ${r.status}`);
        return r.json();
      })
      .then((data: NearbyRestaurant[]) => setPlaces(data))
      .catch((e) => {
        console.error(e);
        toast.error("Could not load nearby restaurants");
      })
      .finally(() => setLoading(false));
  }, [userLat, userLng, radiusKm]);

  const positioned = useMemo(() => {
    // Approximate the rendered pill as an AABB centred (vertically) on the thumbnail.
    // Anchor (x,y) sits at the thumbnail centre; pill extends right to fit name + heart.
    const truncate = (name: string) => {
      const w = name.split(/\s+/);
      return w.length > 3 ? w.slice(0, 3).join(" ") + "…" : name;
    };

    const initial = places.map((p) => {
      const { x, y } = placeXY(p.bearing_deg, p.distance_km, cx, cy, rx, ry);
      const size = iconSize(p.distance_km, radiusKm);
      const fontSize = Math.max(11, Math.round(size * 0.28));
      const padX = Math.round(size * 0.18);
      const label = truncate(p.name);
      const textW = label.length * fontSize * 0.55; // rough average glyph width
      const heartW = p.is_favourite ? Math.max(10, Math.round(fontSize * 0.9)) + 4 : 0;
      // Pill left edge sits 2px+thumb/2 left of anchor; right edge extends past anchor.
      const left = -(size / 2 + 2);
      const right = size / 2 + 6 + textW + heartW + padX + 2;
      const halfH = size / 2 + 2;
      return { p, x, y, size, left, right, halfH };
    });

    // Relax overlaps via AABB push-apart. On each pair overlap, push along the axis
    // with the smaller penetration so we disturb positions as little as possible.
    const BUFFER = 4;
    const ITERATIONS = 80;
    for (let iter = 0; iter < ITERATIONS; iter++) {
      let moved = false;
      for (let i = 0; i < initial.length; i++) {
        for (let j = i + 1; j < initial.length; j++) {
          const a = initial[i];
          const b = initial[j];
          const aL = a.x + a.left - BUFFER;
          const aR = a.x + a.right + BUFFER;
          const aT = a.y - a.halfH - BUFFER;
          const aB = a.y + a.halfH + BUFFER;
          const bL = b.x + b.left - BUFFER;
          const bR = b.x + b.right + BUFFER;
          const bT = b.y - b.halfH - BUFFER;
          const bB = b.y + b.halfH + BUFFER;
          if (aR <= bL || bR <= aL || aB <= bT || bB <= aT) continue;
          // overlap on each axis
          const ox = Math.min(aR - bL, bR - aL);
          const oy = Math.min(aB - bT, bB - aT);
          if (ox < oy) {
            // push along x
            const dir = a.x < b.x ? -1 : 1; // a moves dir, b moves -dir
            const push = ox / 2;
            a.x += dir * push;
            b.x -= dir * push;
          } else {
            const dir = a.y < b.y ? -1 : 1;
            const push = oy / 2;
            a.y += dir * push;
            b.y -= dir * push;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    return initial;
  }, [places, radiusKm, cx, cy, rx, ry]);

  const ringDistances = useMemo(() => {
    const stops = [1, 3, 5, 10, 20, 50].filter((d) => d <= radiusKm);
    if (!stops.includes(radiusKm)) stops.push(radiusKm);
    return stops;
  }, [radiusKm]);

  async function bulkFavourite() {
    const ids = Array.from(multiSelected);
    const targets = places.filter((x) => ids.includes(x.id) && !x.is_favourite);
    if (targets.length === 0) {
      toast("All selected are already favourited");
      setMultiSelected(new Set());
      return;
    }
    setBulkBusy(true);
    const results = await Promise.allSettled(
      targets.map((t) =>
        fetchWithAuth(`${API}/restaurants/${t.id}/favorite`, { method: "POST" }),
      ),
    );
    const okIds = new Set<string>();
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.ok) okIds.add(targets[i].id);
    });
    setPlaces((prev) =>
      prev.map((x) =>
        okIds.has(x.id) ? { ...x, is_favourite: true, favorite_count: x.favorite_count + 1 } : x,
      ),
    );
    toast.success(`Favourited ${okIds.size} restaurant${okIds.size === 1 ? "" : "s"}`);
    setMultiSelected(new Set());
    setBulkBusy(false);
  }

  async function toggleFavourite(p: NearbyRestaurant) {
    const method = p.is_favourite ? "DELETE" : "POST";
    const res = await fetchWithAuth(`${API}/restaurants/${p.id}/favorite`, { method });
    if (!res.ok) {
      toast.error(p.is_favourite ? "Could not unfavourite" : "Could not favourite");
      return;
    }
    setPlaces((prev) =>
      prev.map((x) =>
        x.id === p.id
          ? {
              ...x,
              is_favourite: !p.is_favourite,
              favorite_count: x.favorite_count + (p.is_favourite ? -1 : 1),
            }
          : x,
      ),
    );
    if (selected?.id === p.id) {
      setSelected({ ...selected, is_favourite: !p.is_favourite });
    }
  }

  return (
    <div className="relative w-full" ref={wrapRef}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Compass size={16} />
          <span>
            {loading
              ? "Scanning your area…"
              : `${places.length} restaurant${places.length === 1 ? "" : "s"} within ${radiusKm} km`}
          </span>
          <span className="hidden sm:inline text-xs text-gray-400">· shift+click to multi-select</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm rounded-md border hover:bg-gray-50"
          >
            List view
          </button>
        )}
      </div>

      <div
        ref={canvasRef}
        onPointerDown={(e) => {
          // Skip clicks that originated on pill/dish buttons so they keep working.
          if ((e.target as HTMLElement).closest("button, a, [data-no-pan]")) return;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
          setIsDragging(true);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          setPan({
            x: dragRef.current.baseX + (e.clientX - dragRef.current.startX),
            y: dragRef.current.baseY + (e.clientY - dragRef.current.startY),
          });
        }}
        onPointerUp={(e) => {
          if (!dragRef.current) return;
          (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
          dragRef.current = null;
          setIsDragging(false);
        }}
        onPointerCancel={() => { dragRef.current = null; setIsDragging(false); }}
        className={`relative isolate w-full bg-gradient-to-br from-emerald-50 via-white to-orange-50 rounded-2xl border shadow-inner overflow-hidden touch-none select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ height: "calc(100vh - 100px)" }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
        <svg
          viewBox={`0 0 ${canvasSize.w} ${canvasSize.h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          {/* compass labels */}
          {(["N", "E", "S", "W"] as const).map((d, i) => {
            // Place compass labels just outside the baseline ring.
            const compassKm = BASELINE_KM + (24 / Math.max(rx, ry)) * BASELINE_KM;
            const pos = placeXY(i * 90, compassKm, cx, cy, rx, ry);
            return (
              <text
                key={d}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-gray-400 select-none"
                style={{ fontSize: 14, fontWeight: 600 }}
              >
                {d}
              </text>
            );
          })}

          {/* distance rings (ellipses) — sized by km/BASELINE_KM, fixed scale */}
          {ringDistances.map((d) => {
            const t = d / BASELINE_KM;
            return (
              <g key={d}>
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={rx * t}
                  ry={ry * t}
                  fill="none"
                  stroke="rgba(120,120,120,0.18)"
                  strokeDasharray="4 6"
                />
                <text
                  x={cx + 4}
                  y={cy - ry * t - 2}
                  className="fill-gray-400 select-none"
                  style={{ fontSize: 10 }}
                >
                  {d} km
                </text>
              </g>
            );
          })}

          {/* tree branches for every restaurant — fade with on-screen distance from viewport center */}
          {(() => {
            // Screen position of a canvas point (px, py) = (px * zoom + pan.x, py * zoom + pan.y).
            // The screen-space focal point (canvas center) corresponds to the canvas-coord
            // ((cx - pan.x) / zoom, (cy - pan.y) / zoom). Distance from that focal point in
            // canvas units is then divided by max(rx, ry)/zoom to normalize.
            const focusX = (cx - pan.x) / zoom;
            const focusY = (cy - pan.y) / zoom;
            const maxDist = Math.max(rx, ry) / zoom;
            return positioned.map((it) => {
              const isMulti = multiSelected.has(it.p.id);
              const active = hovered === it.p.id || selected?.id === it.p.id || isMulti;
              const color = isMulti ? "#2563eb" : active ? "#ea580c" : "#84cc16";
              const d = Math.hypot(it.x - focusX, it.y - focusY);
              const t = Math.min(d / maxDist, 1);
              const baseOpacity = Math.max(0.12, 1 - Math.sqrt(t) * 0.88);
              return (
                <path
                  key={`branch-${it.p.id}`}
                  d={branchPath(cx, cy, it.x, it.y, it.p.id)}
                  fill="none"
                  stroke={color}
                  strokeWidth={active ? 4 : 2}
                  strokeLinecap="round"
                  opacity={active ? 1 : baseOpacity}
                />
              );
            });
          })()}

          {/* distance label on hovered restaurant's branch */}
          {hovered && (() => {
            const it = positioned.find((q) => q.p.id === hovered);
            if (!it) return null;
            const mx = (cx + it.x) / 2;
            const my = (cy + it.y) / 2;
            const label = `${it.p.distance_km.toFixed(2)} km`;
            return (
              <g>
                <rect
                  x={mx - label.length * 3.5 - 6}
                  y={my - 10}
                  width={label.length * 7 + 12}
                  height={18}
                  rx={9}
                  fill="white"
                  stroke="#ea580c"
                  strokeWidth={1.5}
                />
                <text
                  x={mx}
                  y={my}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-orange-600 select-none"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {label}
                </text>
              </g>
            );
          })()}

          {/* user node — anchored to canvas edge when panned off-screen so the marker
              is always visible. We render it inside the translated layer, so to land
              on screen at (sx, sy) we draw at (sx - pan.x, sy - pan.y). */}
          {(() => {
            const m = 40; // keep marker fully inside the visible rect
            const trueScreenX = cx * zoom + pan.x;
            const trueScreenY = cy * zoom + pan.y;
            const sx = Math.max(m, Math.min(canvasSize.w - m, trueScreenX));
            const sy = Math.max(m, Math.min(canvasSize.h - m, trueScreenY));
            const ux = (sx - pan.x) / zoom;
            const uy = (sy - pan.y) / zoom;
            const offScreen = sx !== trueScreenX || sy !== trueScreenY;
            // Match the distance-ring aspect so the pulse rings look like ovals on wide screens.
            const aspect = ry > 0 ? rx / ry : 1;
            return (
              <g>
                <ellipse cx={ux} cy={uy} rx={22 * aspect} ry={22} fill="#fb923c" />
                <ellipse cx={ux} cy={uy} rx={28 * aspect} ry={28} fill="none" stroke="#fb923c" opacity={0.3} />
                <ellipse cx={ux} cy={uy} rx={36 * aspect} ry={36} fill="none" stroke="#fb923c" opacity={0.15} />
                <text
                  x={ux}
                  y={uy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: 18 }}
                >
                  👤
                </text>
                {offScreen && (() => {
                  // Vector from anchored icon toward true user position (cx, cy).
                  const dx = cx - ux;
                  const dy = cy - uy;
                  const len = Math.hypot(dx, dy) || 1;
                  const nx = dx / len;
                  const ny = dy / len;
                  // Arrow shaft starts just outside the marker ring, runs ~32px outward.
                  const startGap = 26;
                  const shaftLen = 32;
                  const x1 = ux + nx * startGap;
                  const y1 = uy + ny * startGap;
                  const x2 = ux + nx * (startGap + shaftLen);
                  const y2 = uy + ny * (startGap + shaftLen);
                  // Arrowhead: two short lines at ±150° from the shaft direction.
                  const headLen = 10;
                  const angle = Math.atan2(ny, nx);
                  const leftA = angle + Math.PI - Math.PI / 6;
                  const rightA = angle + Math.PI + Math.PI / 6;
                  const hxL = x2 + Math.cos(leftA) * headLen;
                  const hyL = y2 + Math.sin(leftA) * headLen;
                  const hxR = x2 + Math.cos(rightA) * headLen;
                  const hyR = y2 + Math.sin(rightA) * headLen;
                  return (
                    <g stroke="#fb923c" strokeWidth={2.5} strokeLinecap="round" fill="none">
                      <line x1={x1} y1={y1} x2={x2} y2={y2} />
                      <line x1={x2} y1={y2} x2={hxL} y2={hyL} />
                      <line x1={x2} y1={y2} x2={hxR} y2={hyR} />
                    </g>
                  );
                })()}
              </g>
            );
          })()}
        </svg>

        {/* restaurant pills as HTML overlay: thumbnail + full name in a rounded rectangle */}
        {positioned.map(({ p, x, y, size }) => {
          const left = canvasSize.w > 0 ? (x / canvasSize.w) * 100 : 50;
          const top = canvasSize.h > 0 ? (y / canvasSize.h) * 100 : 50;
          const img = p.photo_reference
            ? `${API}/restaurants/${p.id}/photo?w=200`
            : null;
          const isHover = hovered === p.id;
          const isSelected = selected?.id === p.id;
          const isMulti = multiSelected.has(p.id);
          // Thumb and font scale with proximity; pill height tracks thumb.
          const thumb = size;
          const fontSize = Math.max(11, Math.round(size * 0.28));
          const padX = Math.round(size * 0.18);
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                if (e.shiftKey) {
                  setMultiSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  });
                } else {
                  setSelected(p);
                }
              }}
              onMouseEnter={() => {
                cancelClearHover();
                setHovered(p.id);
                setHoveredRestId(p.id);
              }}
              onMouseLeave={() => {
                setHovered(null);
                scheduleClearHover();
              }}
              className={`absolute -translate-y-1/2 flex items-center gap-1.5 backdrop-blur shadow-lg rounded-full transition-transform hover:scale-105 ${
                isMulti
                  ? "bg-blue-50 ring-2 ring-blue-500 scale-110"
                  : isSelected
                    ? "bg-orange-50 ring-2 ring-orange-500 scale-110"
                    : "bg-white/95 ring-2 ring-white hover:bg-white"
              }`}
              style={{
                // Anchor on the thumbnail center (2px padding + thumb/2 from pill's left edge)
                // so branches visually originate from the photo, not the pill midpoint.
                left: `calc(${left}% - ${2 + thumb / 2}px)`,
                top: `${top}%`,
                paddingRight: padX,
                paddingLeft: 2,
                paddingTop: 2,
                paddingBottom: 2,
                maxWidth: "40%",
                zIndex: isSelected || isMulti ? 40 : isHover ? 30 : 10 + Math.round(100 - p.distance_km),
              }}
              title={`${p.name}\n${p.formatted_address}\n${p.distance_km.toFixed(2)} km`}
            >
              <div
                className="flex-shrink-0 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center"
                style={{ width: thumb, height: thumb }}
              >
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img}
                    alt=""
                    width={thumb}
                    height={thumb}
                    style={{ width: thumb, height: thumb, objectFit: "cover" }}
                  />
                ) : (
                  <span className="text-orange-700 font-semibold" style={{ fontSize }}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <span
                className="font-medium text-gray-800 whitespace-nowrap leading-tight"
                style={{ fontSize }}
              >
                {(() => {
                  const words = p.name.split(/\s+/);
                  return words.length > 3 ? words.slice(0, 3).join(" ") + "…" : p.name;
                })()}
              </span>
              {p.is_favourite && (
                <Heart size={Math.max(10, Math.round(fontSize * 0.9))} className="fill-red-500 text-red-500 flex-shrink-0" />
              )}
            </button>
          );
        })}

        {/* Dish sub-tree: when a restaurant is hovered, fan out its dishes around it. */}
        {(() => {
          if (!hoveredRestId) return null;
          const host = positioned.find((it) => it.p.id === hoveredRestId);
          const dishes = dishesByRestaurant[hoveredRestId];
          if (!host || !dishes || dishes.length === 0) return null;
          // Bias dishes away from the user: base angle = bearing from user → restaurant
          // (already encoded by host position relative to cx,cy). Fan ±90° around that.
          const dxFromUser = host.x - cx;
          const dyFromUser = host.y - cy;
          const baseAngle = Math.atan2(dyFromUser, dxFromUser); // SVG coords (y down)
          const fan = (Math.PI * 2) / 3; // 120° total spread
          const reach = Math.max(60, host.size * 1.8);
          const dishSize = Math.max(28, Math.round(host.size * 0.6));
          const nodes = dishes.map((d, i) => {
            const t = dishes.length === 1 ? 0 : i / (dishes.length - 1) - 0.5;
            const a = baseAngle + t * fan;
            const x = host.x + Math.cos(a) * reach;
            const y = host.y + Math.sin(a) * reach;
            return { d, x, y };
          });
          return (
            <>
              <svg
                viewBox={`0 0 ${canvasSize.w} ${canvasSize.h}`}
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ zIndex: 35 }}
              >
                {nodes.map(({ d, x, y }) => (
                  <path
                    key={`dish-branch-${d.id}`}
                    d={branchPath(host.x, host.y, x, y, `${hoveredRestId}-${d.id}`)}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                ))}
              </svg>
              {nodes.map(({ d, x, y }) => {
                const left = canvasSize.w > 0 ? (x / canvasSize.w) * 100 : 50;
                const top = canvasSize.h > 0 ? (y / canvasSize.h) * 100 : 50;
                const img = d.image_key
                  ? `${API}/dishes/${d.id}/image?w=120`
                  : `${API}/dishes/${d.id}/image?w=120`;
                return (
                  <div
                    key={`dish-${d.id}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-white/95 rounded-full ring-2 ring-orange-300 shadow pointer-events-auto"
                    style={{ left: `${left}%`, top: `${top}%`, padding: 2, paddingRight: 8, zIndex: 35 }}
                    onMouseEnter={cancelClearHover}
                    onMouseLeave={scheduleClearHover}
                    title={d.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt=""
                      width={dishSize}
                      height={dishSize}
                      style={{ width: dishSize, height: dishSize, borderRadius: "9999px", objectFit: "cover" }}
                    />
                    <span className="text-[11px] font-medium text-gray-700 whitespace-nowrap">
                      {(() => {
                        const words = d.name.split(/\s+/);
                        return words.length > 3 ? words.slice(0, 3).join(" ") + "…" : d.name;
                      })()}
                    </span>
                  </div>
                );
              })}
            </>
          );
        })()}
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <p className="text-sm text-gray-600">Scanning your area…</p>
          </div>
        )}
      </div>

      {multiSelected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-white border shadow-xl rounded-full pl-4 pr-2 py-2 flex items-center gap-3">
          <span className="text-sm font-medium text-blue-700">
            {multiSelected.size} selected
          </span>
          <button
            onClick={bulkFavourite}
            disabled={bulkBusy}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500 text-white text-sm hover:bg-red-600 disabled:opacity-50"
          >
            <Heart size={14} /> Favourite all
          </button>
          <button
            onClick={() => setMultiSelected(new Set())}
            className="px-3 py-1.5 rounded-full text-sm text-gray-600 hover:bg-gray-100"
          >
            Clear
          </button>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {selected.photo_reference && (
              <div className="relative w-full h-40">
                <Image
                  src={`${API}/restaurants/${selected.id}/photo?w=600`}
                  alt={selected.name}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-lg">{selected.name}</h3>
                <button
                  onClick={() => toggleFavourite(selected)}
                  className="p-2 rounded-full hover:bg-gray-100"
                  aria-label="Toggle favourite"
                >
                  <Heart
                    size={20}
                    className={selected.is_favourite ? "fill-red-500 text-red-500" : "text-gray-500"}
                  />
                </button>
              </div>
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <MapPin size={14} /> {selected.formatted_address}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{selected.distance_km.toFixed(2)} km away</span>
                <span>•</span>
                <span>bearing {Math.round(selected.bearing_deg)}°</span>
                {selected.cuisine && (
                  <>
                    <span>•</span>
                    <span>{selected.cuisine}</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-full mt-2 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
