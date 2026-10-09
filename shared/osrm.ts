import type { LatLng, Maneuver, RouteData } from './types';
import { cumulativeDistances, curvinessIndex } from './geo';

/* Minimal OSRM response shapes we rely on. */
export interface OsrmStep {
  distance: number;
  name: string;
  maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number };
}
export interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: OsrmStep[] }[];
}

const KEPT = new Set([
  'depart', 'arrive', 'turn', 'end of road', 'fork', 'on ramp', 'off ramp', 'merge',
  'roundabout', 'rotary', 'roundabout turn',
]);

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

function phrase(s: OsrmStep): string {
  const { type, modifier, exit } = s.maneuver;
  const road = s.name ? ` onto ${s.name}` : '';
  const mod = modifier ?? 'straight';
  switch (type) {
    case 'depart': return s.name ? `head out on ${s.name}` : 'head out';
    case 'arrive': return 'arrive at your destination';
    case 'fork': return `keep ${mod.includes('left') ? 'left' : 'right'} at the fork${road}`;
    case 'on ramp': return `take the ramp${road}`;
    case 'off ramp': return `take the exit${road}`;
    case 'merge': return `merge${s.name ? ` onto ${s.name}` : ''}`;
    case 'roundabout':
    case 'rotary': return `at the roundabout, take the ${ORD[exit ?? 1] ?? `${exit}th`} exit${road}`;
    case 'end of road': return `turn ${mod} at the end of the road${road}`;
    default: return mod === 'straight' ? `continue${road}` : `turn ${mod}${road}`;
  }
}

/**
 * Stitch one or more OSRM routes (e.g. one per leg) into a single continuous
 * RouteData. Intermediate 'arrive'/'depart' steps are dropped so the rider is
 * never asked to stop or confirm a waypoint.
 */
export function stitchOsrm(routes: OsrmRoute[], waypoints: LatLng[], name: string): RouteData {
  const geometry: [number, number][] = [];
  for (const r of routes) {
    const pts = r.geometry.coordinates;
    geometry.push(...(geometry.length ? pts.slice(1) : pts)); // drop duplicated join point
  }
  const cumulative = cumulativeDistances(geometry);

  const steps: OsrmStep[] = routes.flatMap((r) => r.legs.flatMap((l) => l.steps));
  const osrmTotal = steps.reduce((s, st) => s + st.distance, 0) || 1;
  const scale = cumulative[cumulative.length - 1] / osrmTotal; // reconcile OSRM vs haversine length

  const maneuvers: Maneuver[] = [];
  let offset = 0;
  steps.forEach((s, i) => {
    const at = offset * scale;
    offset += s.distance;
    const t = s.maneuver.type;
    const first = i === 0;
    const last = i === steps.length - 1;
    if (!KEPT.has(t)) return;
    if (t === 'depart' && !first) return;
    if (t === 'arrive' && !last) return;
    const [lng, lat] = s.maneuver.location;
    maneuvers.push({
      id: maneuvers.length + 1,
      at: last ? cumulative[cumulative.length - 1] : at,
      type: t,
      modifier: s.maneuver.modifier,
      road: s.name,
      text: phrase(s),
      location: { lat, lng },
    });
  });

  return {
    id: `r_${Date.now().toString(36)}`,
    name,
    waypoints,
    geometry,
    cumulative,
    distance: cumulative[cumulative.length - 1],
    duration: routes.reduce((s, r) => s + r.duration, 0),
    curviness: curvinessIndex(geometry, cumulative),
    maneuvers,
  };
}
