import type { LatLng, RoutePreference } from '../../shared/types';
import { api } from './api';
import { useApp } from '../store';

/**
 * Show a usable route immediately, then upgrade it.
 * For "curvy" the fast route appears in ~1 s (Start works right away); the detour search
 * then runs and replaces it - unless the rider edited the stops or started riding meanwhile.
 */
export async function buildProgressive(
  waypoints: LatLng[],
  prefer: RoutePreference,
  name?: string,
  onRefining?: (busy: boolean) => void,
) {
  const { setRoute } = useApp.getState();
  const quick = await api.route(waypoints, 'fastest', name);
  setRoute(quick);
  if (prefer !== 'curvy') return;

  onRefining?.(true);
  try {
    const curvy = await api.route(waypoints, 'curvy', name);
    const s = useApp.getState();
    if (s.route?.id === quick.id && !s.navigating) setRoute(curvy);
  } catch {
    /* keep the fast route; the search is best-effort */
  } finally {
    onRefining?.(false);
  }
}
