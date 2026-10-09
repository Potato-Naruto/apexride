import type { LatLng } from '../../shared/types';
import { durationMatrix } from './routing';

export interface MidpointResult {
  point: LatLng;
  /** Seconds each rider needs to reach the point, same order as input. */
  etas: number[];
  /** max - min ETA in seconds (0 = perfectly fair). */
  spread: number;
}

function grid(center: LatLng, halfKm: number, n: number): LatLng[] {
  const out: LatLng[] = [];
  const dLat = halfKm / 110.54;
  const dLng = halfKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      out.push({
        lat: center.lat + dLat * ((2 * i) / (n - 1) - 1),
        lng: center.lng + dLng * ((2 * j) / (n - 1) - 1),
      });
  return out;
}

async function best(riders: LatLng[], candidates: LatLng[]): Promise<MidpointResult> {
  const { durations, snapped } = await durationMatrix(riders, candidates);
  let result: MidpointResult | null = null;
  snapped.forEach((point, c) => {
    const etas = durations.map((row) => row[c]);
    if (etas.some((e) => e == null)) return; // unreachable (water, no road)
    const e = etas as number[];
    const spread = Math.max(...e) - Math.min(...e);
    // Primary: fairness. Tie-break: shorter worst-case ride.
    const score = spread + 0.15 * Math.max(...e);
    const prev = result ? result.spread + 0.15 * Math.max(...result.etas) : Infinity;
    if (score < prev) result = { point, etas: e, spread };
  });
  if (!result) throw new Error('No reachable meeting point found');
  return result;
}

/** Coarse 5x5 grid around the centroid, then a fine 5x5 grid around the winner. */
export async function fairMidpoint(riders: LatLng[]): Promise<MidpointResult> {
  if (riders.length < 2) throw new Error('Need at least two riders');
  const center = {
    lat: riders.reduce((s, r) => s + r.lat, 0) / riders.length,
    lng: riders.reduce((s, r) => s + r.lng, 0) / riders.length,
  };
  const maxSpanKm =
    Math.max(...riders.map((r) => Math.hypot((r.lat - center.lat) * 110.54, (r.lng - center.lng) * 111.32 * Math.cos((center.lat * Math.PI) / 180)))) || 1;
  const coarse = await best(riders, grid(center, maxSpanKm * 0.8, 5));
  return best(riders, grid(coarse.point, maxSpanKm * 0.2, 5));
}
