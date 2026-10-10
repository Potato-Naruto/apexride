import type { LatLng, RouteData, RoutePreference } from '../../shared/types';
import {
  bearing, cumulativeDistances, curvinessDegPerKm, curvinessIndex, haversine,
  maneuversFromGeometry, pointAt, resample, snapToRoute,
} from '../../shared/geo';
import { stitchOsrm, type OsrmRoute } from '../../shared/osrm';
import { getJsonWithFallback, mapLimit, UserError } from './http';

/** Tried in order; your own OSRM (OSRM_URL) goes first when configured. */
const ENGINES = [
  ...new Set([globalThis.process?.env?.OSRM_URL, 'https://router.project-osrm.org', 'https://routing.openstreetmap.de/routed-car'].filter(Boolean) as string[]),
];
const MAX_WAYPOINTS = 25;
/** In curvy mode a leg may take up to this much longer than the direct route. */
const CURVY_TIME_BUDGET = 2;
/** Whole curvy search gives up (and keeps its best so far) after this long. */
const CURVY_DEADLINE_MS = 9_000;
const SEARCH_CONCURRENCY = 6;
/** Only search for detours on legs longer than this. */
const MIN_LEG_M = 3_000;
/** A detour must beat the direct route's curviness by this factor to be worth taking. */
const MIN_GAIN = 1.08;

const coordStr = (pts: LatLng[]) => pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');

async function osrm<T>(path: string, opts?: { timeoutMs?: number; retries?: number }): Promise<T> {
  const json = await getJsonWithFallback<{ code: string; message?: string } & T>(ENGINES, path, opts);
  if (json.code === 'NoRoute' || json.code === 'NoSegment') throw new UserError('No drivable road connects those stops. Move a pin onto a road.');
  if (json.code === 'InvalidQuery' || json.code === 'InvalidValue') throw new UserError(json.message ?? 'Invalid route request');
  if (json.code !== 'Ok') throw new Error(json.message ?? `Routing failed: ${json.code}`);
  return json;
}

/** Identical requests (same stops, same detail level) share one network call. */
const cache = new Map<string, Promise<OsrmRoute>>();
function route(pts: LatLng[], steps: boolean, opts?: { timeoutMs?: number; retries?: number }): Promise<OsrmRoute> {
  const key = `${steps}|${coordStr(pts)}`;
  let p = cache.get(key);
  if (!p) {
    p = osrm<{ routes: OsrmRoute[] }>(
      `/route/v1/driving/${coordStr(pts)}?overview=full&geometries=geojson&steps=${steps}&alternatives=false`,
      opts,
    ).then((j) => j.routes[0]);
    p.catch(() => cache.delete(key)); // never cache failures
    cache.set(key, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/** Point at fraction t along a->b, pushed sideways by k * (leg length). */
function detourPoint(a: LatLng, b: LatLng, t: number, k: number): LatLng {
  const D = haversine(a, b);
  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;
  const side = ((bearing(a, b) + 90) * Math.PI) / 180;
  return {
    lat: lat + (Math.cos(side) * k * D) / 110540,
    lng: lng + (Math.sin(side) * k * D) / (111320 * Math.cos((lat * Math.PI) / 180)),
  };
}

/** Candidate detour via-points: both sides, a few depths and positions along the leg. */
const PROBES: [t: number, k: number][] = [
  [0.5, 0.2], [0.5, -0.2], [0.5, 0.4], [0.5, -0.4],
  [0.33, 0.3], [0.33, -0.3], [0.67, 0.3], [0.67, -0.3],
];

/** Fraction of a route that re-drives ground it already covered (out-and-back spurs). */
function backtrackRatio(coords: [number, number][]): number {
  const cum = cumulativeDistances(coords);
  const pts = resample(coords, cum, 30);
  const seen = new Set<string>();
  let dup = 0;
  for (const p of pts) {
    const k = `${Math.round(p.lat * 3000)},${Math.round(p.lng * 3000)}`; // ~35 m cells
    if (seen.has(k)) dup++;
    else seen.add(k);
  }
  return dup / pts.length;
}

/**
 * For every leg, find the detour via-point (or none) that maximises twistiness while staying
 * within the time budget. Returns the chosen via per leg. All probes run in one pooled batch.
 */
async function chooseDetours(waypoints: LatLng[]): Promise<(LatLng | null)[]> {
  const deadline = Date.now() + CURVY_DEADLINE_MS;
  const legs = waypoints.slice(0, -1).map((a, i) => ({ a, b: waypoints[i + 1] }));
  type Task = { leg: number; via: LatLng | null };
  const tasks: Task[] = legs.flatMap((l, leg) => [
    { leg, via: null } as Task,
    ...(haversine(l.a, l.b) >= MIN_LEG_M ? PROBES.map(([t, k]) => ({ leg, via: detourPoint(l.a, l.b, t, k) })) : []),
  ]);

  // Two passes: the free servers drop requests under load, so retry whatever failed once.
  const results: ({ task: Task; r: OsrmRoute } | null)[] = tasks.map(() => null);
  for (let pass = 0; pass < 2; pass++) {
    const todo = tasks.map((_, i) => i).filter((i) => !results[i]);
    if (!todo.length || Date.now() > deadline) break;
    await mapLimit(todo, SEARCH_CONCURRENCY, async (i) => {
      if (Date.now() > deadline) return;
      const task = tasks[i];
      const { a, b } = legs[task.leg];
      try {
        results[i] = { task, r: await route(task.via ? [a, task.via, b] : [a, b], false, { timeoutMs: 6_000, retries: 1 }) };
      } catch {
        /* retried on the next pass */
      }
    });
  }

  return legs.map((_, leg) => {
    const mine = results.filter((x): x is NonNullable<typeof x> => !!x && x.task.leg === leg);
    const direct = mine.find((x) => !x.task.via);
    if (!direct) return null;
    const baseline = curvinessDegPerKm(direct.r.geometry.coordinates);
    let best: { via: LatLng; score: number } | null = null;
    for (const { task, r } of mine) {
      if (!task.via || r.duration > direct.r.duration * CURVY_TIME_BUDGET) continue;
      if (backtrackRatio(r.geometry.coordinates) > 0.1) continue;
      const score = curvinessDegPerKm(r.geometry.coordinates);
      if (score > (best?.score ?? baseline * MIN_GAIN)) best = { via: task.via, score };
    }
    return best?.via ?? null;
  });
}

export async function buildRoute(waypoints: LatLng[], prefer: RoutePreference, name = 'Custom route'): Promise<RouteData> {
  if (waypoints.length < 2) throw new Error('Need at least two waypoints');
  if (waypoints.length > MAX_WAYPOINTS) throw new Error(`Max ${MAX_WAYPOINTS} waypoints`);

  let stops = waypoints;
  if (prefer === 'curvy') {
    const vias = await chooseDetours(waypoints);
    stops = waypoints.flatMap((w, i) => (i < vias.length && vias[i] ? [w, vias[i]!] : [w]));
  }
  // One request for the whole trip. Detour points are just anchors: stitchOsrm drops their
  // arrive/depart steps, so they never become stops or spoken cues.
  const osrmRoute = await route(stops, true);
  const built = stitchOsrm([osrmRoute], waypoints, name);
  // Move each pin onto the road line it was snapped to, so pins and route always coincide on the map.
  built.waypoints = waypoints.map((w, i) => {
    if (i === 0) return { lat: built.geometry[0][1], lng: built.geometry[0][0] };
    if (i === waypoints.length - 1) return { lat: built.geometry.at(-1)![1], lng: built.geometry.at(-1)![0] };
    const s = snapToRoute(w, built.geometry, built.cumulative, 0, built.geometry.length);
    const p = pointAt(built.geometry, built.cumulative, s.along);
    return { lat: p.lat, lng: p.lng };
  });
  return built;
}

/** Use a recorded track as-is (no re-routing); maneuvers are inferred from shape. */
export function buildTrackRoute(coords: [number, number][], name: string): RouteData {
  const cumulative = cumulativeDistances(coords);
  const distance = cumulative[cumulative.length - 1];
  const [slng, slat] = coords[0];
  const [elng, elat] = coords[coords.length - 1];
  return {
    id: `t_${Date.now().toString(36)}`,
    name,
    waypoints: [{ lat: slat, lng: slng }, { lat: elat, lng: elng }],
    geometry: coords,
    cumulative,
    distance,
    duration: distance / 17, // ~38 mph average, only an estimate
    curviness: curvinessIndex(coords, cumulative),
    maneuvers: maneuversFromGeometry(coords, cumulative),
  };
}

/** Travel-time matrix (seconds) sources -> destinations, plus snapped destination locations. */
export async function durationMatrix(sources: LatLng[], dests: LatLng[]) {
  const all = [...sources, ...dests];
  const src = sources.map((_, i) => i).join(';');
  const dst = dests.map((_, i) => sources.length + i).join(';');
  const json = await osrm<{ durations: (number | null)[][]; destinations: { location: [number, number] }[] }>(
    `/table/v1/driving/${coordStr(all)}?sources=${src}&destinations=${dst}`,
  );
  return {
    durations: json.durations,
    snapped: json.destinations.map(({ location: [lng, lat] }) => ({ lat, lng })),
  };
}
