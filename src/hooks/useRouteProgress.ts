import { useEffect, useRef, useState } from 'react';
import type { Maneuver, RouteData } from '../../shared/types';
import { snapToRoute } from '../../shared/geo';
import type { Fix } from '../store';

export interface Progress {
  along: number;
  remaining: number;
  offset: number;
  offRoute: boolean;
  next?: Maneuver;
  after?: Maneuver;
  prev?: Maneuver;
  currentRoad: string;
  finished: boolean;
}

const OFF_ROUTE_M = 70;
const OFF_ROUTE_FIXES = 3;
/** A maneuver counts as passed once we are this far beyond it. */
const PASSED_M = 25;

/**
 * Snaps each fix onto the route and derives "what's next". Passing through a
 * waypoint never changes state - progress is purely distance along one polyline,
 * which is what removes Google Maps' per-stop prompts.
 */
export function useRouteProgress(route: RouteData | null, fix: Fix | null): Progress | null {
  const [progress, setProgress] = useState<Progress | null>(null);
  const hint = useRef(0);
  const bad = useRef(0);
  const maxAlong = useRef(0);

  useEffect(() => {
    hint.current = 0;
    bad.current = 0;
    maxAlong.current = 0;
    setProgress(null);
  }, [route?.id]);

  useEffect(() => {
    if (!route || !fix) return;
    const snap = snapToRoute(fix, route.geometry, route.cumulative, hint.current);
    hint.current = snap.index;

    const off = snap.offset > OFF_ROUTE_M;
    bad.current = off ? bad.current + 1 : 0;
    // Don't let GPS jitter move us backwards along the line.
    const along = off ? maxAlong.current : Math.max(maxAlong.current, snap.along);
    maxAlong.current = along;

    const upcoming = route.maneuvers.filter((m) => m.at > along - PASSED_M);
    const idx = route.maneuvers.indexOf(upcoming[0]);
    setProgress({
      along,
      remaining: route.distance - along,
      offset: snap.offset,
      offRoute: bad.current >= OFF_ROUTE_FIXES,
      next: upcoming[0],
      after: upcoming[1],
      prev: idx > 0 ? route.maneuvers[idx - 1] : undefined,
      currentRoad: (idx > 0 ? route.maneuvers[idx - 1] : route.maneuvers[0])?.road ?? '',
      finished: route.distance - along < 30,
    });
  }, [route, fix]);

  return progress;
}
