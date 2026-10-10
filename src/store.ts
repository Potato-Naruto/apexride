import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { LatLng, Rider, RouteData, RoutePreference } from '../shared/types';

export type Tab = 'plan' | 'ride' | 'group' | 'discover';

export interface Fix {
  lat: number;
  lng: number;
  /** m/s */
  speed: number;
  heading: number;
  accuracy: number;
  ts: number;
}

interface State {
  tab: Tab;
  route: RouteData | null;
  waypoints: LatLng[];
  prefer: RoutePreference;
  building: boolean;
  error: string | null;

  navigating: boolean;
  simulate: boolean;
  voiceOn: boolean;
  listenOn: boolean;
  fix: Fix | null;
  /** Map camera follows the rider; cleared when the user pans away. */
  follow: boolean;
  /** Rider pressed 'show my location' - start GPS even when not navigating. */
  locating: boolean;

  groupCode: string | null;
  /** Peer-to-peer mode: this device owns the route and sends it to joiners. */
  groupHost: boolean;
  /** Peer-to-peer mode: joined, waiting for the host's device to send the route. */
  awaitingRoute: boolean;
  riders: Record<string, Rider>;

  setTab: (t: Tab) => void;
  setRoute: (r: RouteData | null) => void;
  setWaypoints: (w: LatLng[]) => void;
  set: (p: Partial<State>) => void;
}

export const useApp = create<State>((set) => ({
  tab: 'plan',
  route: null,
  waypoints: [],
  prefer: 'fastest',
  building: false,
  error: null,
  navigating: false,
  simulate: false,
  voiceOn: true,
  listenOn: false,
  fix: null,
  follow: true,
  locating: false,
  groupCode: null,
  groupHost: false,
  awaitingRoute: false,
  riders: {},

  setTab: (tab) => set({ tab }),
  setRoute: (route) => {
    set({ route, waypoints: route?.waypoints ?? [] });
    // Persist so the ride still works with no signal at the trailhead.
    void idbSet('apex:route', route).catch(() => {});
  },
  // Editing stops invalidates the built route, so the map never shows a line that doesn't match the pins.
  setWaypoints: (waypoints) => set((s) => ({ waypoints, route: s.navigating ? s.route : null })),
  set: (p) => set(p),
}));

export async function restoreRoute() {
  const r = await idbGet<RouteData | null>('apex:route').catch(() => null);
  if (r) useApp.setState({ route: r, waypoints: r.waypoints });
}
