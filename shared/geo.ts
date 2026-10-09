import type { LatLng, Maneuver } from './types';

export const MI = 1609.344;
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a -> b in degrees [0, 360). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed smallest difference b - a in degrees, range (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

const ll = ([lng, lat]: [number, number]): LatLng => ({ lat, lng });

export function cumulativeDistances(coords: [number, number][]): number[] {
  const out = new Array<number>(coords.length);
  out[0] = 0;
  for (let i = 1; i < coords.length; i++) out[i] = out[i - 1] + haversine(ll(coords[i - 1]), ll(coords[i]));
  return out;
}

/** Point at `dist` metres along the polyline. */
export function pointAt(coords: [number, number][], cum: number[], dist: number): LatLng & { heading: number } {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, dist));
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / seg;
  const a = coords[lo];
  const b = coords[hi];
  return {
    lng: a[0] + (b[0] - a[0]) * t,
    lat: a[1] + (b[1] - a[1]) * t,
    heading: bearing(ll(a), ll(b)),
  };
}

/** Resample to evenly spaced points (metres apart). */
export function resample(coords: [number, number][], cum: number[], step: number): LatLng[] {
  const total = cum[cum.length - 1];
  const out: LatLng[] = [];
  for (let d = 0; d <= total; d += step) out.push(pointAt(coords, cum, d));
  return out;
}

/**
 * Curviness 0-100: total absolute heading change per km on a 40 m resample,
 * ignoring changes under 3 degrees (GPS/shape noise). ~500 deg/km => 100.
 */
/** Uncapped heading change in degrees per km (used to rank candidate routes; the 0-100 index saturates). */
export function curvinessDegPerKm(coords: [number, number][], cum?: number[]): number {
  if (coords.length < 3) return 0;
  const c = cum ?? cumulativeDistances(coords);
  const total = c[c.length - 1];
  if (total < 200) return 0;
  const pts = resample(coords, c, 40);
  let sum = 0;
  let prev = bearing(pts[0], pts[1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const h = bearing(pts[i], pts[i + 1]);
    const d = Math.abs(angleDelta(prev, h));
    if (d > 3) sum += d;
    prev = h;
  }
  return sum / (total / 1000);
}

export function curvinessIndex(coords: [number, number][], cum?: number[]): number {
  return Math.min(100, Math.round(curvinessDegPerKm(coords, cum) / 5));
}

export interface Snap {
  index: number;
  along: number;
  offset: number;
}

function projectOnto(
  p: LatLng,
  a: [number, number],
  b: [number, number],
): { t: number; dist: number } {
  const k = Math.cos(rad(p.lat)) * 111320;
  const ax = (a[0] - p.lng) * k;
  const ay = (a[1] - p.lat) * 110540;
  const bx = (b[0] - p.lng) * k;
  const by = (b[1] - p.lat) * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return { t, dist: Math.hypot(ax + dx * t, ay + dy * t) };
}

function bestInRange(p: LatLng, coords: [number, number][], cum: number[], from: number, to: number): Snap {
  let best: Snap = { index: from, along: cum[from], offset: Infinity };
  for (let i = from; i < to; i++) {
    const { t, dist } = projectOnto(p, coords[i], coords[i + 1]);
    if (dist < best.offset) best = { index: i, along: cum[i] + t * (cum[i + 1] - cum[i]), offset: dist };
  }
  return best;
}

/**
 * Snap a GPS fix to the route. Searches a window ahead of the last known
 * segment first (keeps progress monotonic and handles routes that cross
 * themselves); falls back to a global search if the window is a poor match.
 */
export function snapToRoute(p: LatLng, coords: [number, number][], cum: number[], hint = 0, window = 80): Snap {
  const n = coords.length - 1;
  const from = Math.max(0, hint - 5);
  const to = Math.min(n, hint + window);
  const local = bestInRange(p, coords, cum, from, to);
  if (local.offset < 60) return local;
  const global = bestInRange(p, coords, cum, 0, n);
  return global.offset < local.offset ? global : local;
}

/** Derive coarse turn maneuvers from raw geometry (GPX tracks without routing data). */
export function maneuversFromGeometry(coords: [number, number][], cum: number[]): Maneuver[] {
  const total = cum[cum.length - 1];
  const pts = resample(coords, cum, 20);
  const out: Maneuver[] = [];
  let lastAt = -Infinity;
  const hdg = (i: number, j: number) => bearing(pts[i], pts[j]);

  for (let i = 3; i < pts.length - 3; i++) {
    const delta = angleDelta(hdg(i - 3, i), hdg(i, i + 3));
    const abs = Math.abs(delta);
    if (abs < 50) continue;
    // local maximum within +-3 samples so one corner yields one maneuver
    const isPeak = [-2, -1, 1, 2].every((o) => Math.abs(angleDelta(hdg(i + o - 3, i + o), hdg(i + o, i + o + 3))) <= abs);
    const at = i * 20;
    if (!isPeak || at - lastAt < 80) continue;
    lastAt = at;
    const dir = delta > 0 ? 'right' : 'left';
    const sharp = abs > 120 ? 'sharp ' : abs < 75 ? 'slight ' : '';
    out.push({
      id: out.length + 1,
      at,
      type: 'turn',
      modifier: `${sharp}${dir}`.trim(),
      road: '',
      text: `turn ${sharp}${dir}`,
      location: pts[i],
    });
  }
  const end = pts[pts.length - 1];
  out.push({ id: out.length + 1, at: total, type: 'arrive', road: '', text: 'arrive at your destination', location: end });
  return out;
}
