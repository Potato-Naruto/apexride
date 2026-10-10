import type { LatLng, RouteData } from './types';
import { pointAt, snapToRoute } from './geo';

/** Google's Maps URLs API accepts at most 9 intermediate waypoints. */
export const GOOGLE_MAX_WAYPOINTS = 9;

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

function link(stops: LatLng[]): string {
  const [origin, ...rest] = stops;
  const destination = rest.pop()!;
  const params = [
    'api=1',
    `origin=${fmt(origin)}`,
    `destination=${fmt(destination)}`,
    `travelmode=driving`,
    ...(rest.length ? [`waypoints=${rest.map(fmt).join('%7C')}`] : []),
  ];
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}

/** Keep `max` items spread evenly (always keeping first and last). */
function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]);
}

export interface GoogleLinks {
  /** Origin, your stops in order, destination. Google picks its own roads between them. */
  stops: string;
  /** Your stops plus extra points placed on this route, so Google follows (nearly) the same road. */
  exact: string;
  /** More stops than Google allows were given; some were dropped. */
  truncated: boolean;
  /** Number of intermediate points in the `exact` link. */
  waypointCount: number;
}

export function googleMapsLinks(route: RouteData): GoogleLinks {
  const pins = route.waypoints;
  const first = pins[0];
  const last = pins[pins.length - 1];
  const middle = pins.slice(1, -1);
  const truncated = middle.length > GOOGLE_MAX_WAYPOINTS;
  const keptMiddle = thin(middle, GOOGLE_MAX_WAYPOINTS);

  const total = route.distance;
  const alongOf = (p: LatLng) => snapToRoute(p, route.geometry, route.cumulative, 0, route.geometry.length).along;

  // Anchors along the route: your stops first; then fill free slots at the midpoint of the biggest gap.
  const anchors = [0, ...keptMiddle.map(alongOf), total].sort((a, b) => a - b);
  const extra: number[] = [];
  for (let slots = GOOGLE_MAX_WAYPOINTS - keptMiddle.length; slots > 0; slots--) {
    let gi = 0;
    for (let i = 1; i < anchors.length - 1 + 1; i++) if (anchors[i] - anchors[i - 1] > anchors[gi + 1] - anchors[gi]) gi = i - 1;
    const mid = (anchors[gi] + anchors[gi + 1]) / 2;
    if (anchors[gi + 1] - anchors[gi] < 1500) break; // already dense enough
    extra.push(mid);
    anchors.splice(gi + 1, 0, mid);
  }
  const exactMiddle = [
    ...keptMiddle.map((p) => ({ along: alongOf(p), p })),
    ...extra.map((a) => {
      const q = pointAt(route.geometry, route.cumulative, a);
      return { along: a, p: { lat: q.lat, lng: q.lng } };
    }),
  ]
    .sort((a, b) => a.along - b.along)
    .map((x) => x.p);

  return {
    stops: link([first, ...keptMiddle, last]),
    exact: link([first, ...exactMiddle, last]),
    truncated,
    waypointCount: exactMiddle.length,
  };
}
