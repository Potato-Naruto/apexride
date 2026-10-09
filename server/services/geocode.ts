import type { LatLng } from '../../shared/types';
import { getJsonWithFallback } from './http';

const BASE = globalThis.process?.env?.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';
const UA = globalThis.process?.env?.GEOCODER_UA ?? 'ApexRide/0.1 (dev)';

export interface Place extends LatLng {
  label: string;
}

const cache = new Map<string, Place[]>();

export async function geocode(q: string, limit = 5): Promise<Place[]> {
  const key = `${limit}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // Ask both free geocoders at once and take whichever answers first; either one alone is flaky.
  const nominatim = getJsonWithFallback<{ lat: string; lon: string; display_name: string }[]>(
    [BASE],
    `/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(q)}`,
    { headers: typeof window === 'undefined' ? { 'User-Agent': UA } : undefined, timeoutMs: 6_000, retries: 1 },
  ).then((rows) => {
    if (!rows.length) throw new Error('no results');
    return rows.map((r): Place => ({ lat: +r.lat, lng: +r.lon, label: r.display_name }));
  });
  const photon = getJsonWithFallback<{ features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] }>(
    ['https://photon.komoot.io'],
    `/api/?limit=${limit}&q=${encodeURIComponent(q)}`,
    { timeoutMs: 6_000, retries: 1 },
  ).then((fc) => {
    if (!fc.features.length) throw new Error('no results');
    return fc.features.map((f): Place => ({
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      label: [f.properties.name, f.properties.street, f.properties.city, f.properties.state, f.properties.country].filter(Boolean).join(', '),
    }));
  });
  let out: Place[];
  try {
    out = await Promise.any([nominatim, photon]);
  } catch {
    out = []; // nothing found (or both services down)
  }
  cache.set(key, out);
  return out;
}
