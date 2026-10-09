import type { LatLng, LibraryEntry, RouteData, RoutePreference } from '../../shared/types';

/**
 * Two modes:
 *  - server mode: `npm run dev` (Vite proxies /api) or a build with VITE_API_URL set.
 *  - browser mode: static hosting (e.g. GitHub Pages) with no backend. Routing, place search, the road
 *    library and the fair-midpoint finder run in the browser against the free public services.
 *    Shared rides / group tracking / Google-link import need the server and say so.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const SERVER_MODE = import.meta.env.DEV || !!API_URL;

const NEEDS_SERVER = 'This feature needs the ApexRide server (group rides, share links, Google Maps link import). Deploy the server and set VITE_API_URL.';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const local = () => import('./local');

export const api = {
  route: (waypoints: LatLng[], prefer: RoutePreference, name?: string) =>
    SERVER_MODE ? call<RouteData>('/route', post({ waypoints, prefer, name })) : local().then((l) => l.route(waypoints, prefer, name)),

  importUrl: (url: string, prefer: RoutePreference) =>
    SERVER_MODE ? call<RouteData>('/import', post({ url, prefer })) : Promise.reject(new Error(NEEDS_SERVER)),

  importFile: (text: string, prefer: RoutePreference) => {
    if (!SERVER_MODE) return local().then((l) => l.importFile(text, prefer));
    const isJson = text.trimStart().startsWith('{');
    return call<RouteData>('/import', post(isJson ? { geojson: JSON.parse(text), prefer } : { gpx: text, prefer }));
  },

  geocode: (q: string) =>
    SERVER_MODE
      ? call<(LatLng & { label: string })[]>(`/geocode?q=${encodeURIComponent(q)}`)
      : local().then((l) => l.geocode(q)),

  midpoint: (riders: LatLng[]) =>
    SERVER_MODE
      ? call<{ point: LatLng; etas: number[]; spread: number }>('/midpoint', post({ riders }))
      : local().then((l) => l.midpoint(riders)),

  share: (route: RouteData) =>
    SERVER_MODE ? call<{ code: string }>('/share', post({ route })) : Promise.reject(new Error(NEEDS_SERVER)),

  shared: (code: string) =>
    SERVER_MODE ? call<RouteData>(`/share/${code}`) : Promise.reject(new Error(NEEDS_SERVER)),

  library: (params: Record<string, string>) =>
    SERVER_MODE
      ? call<LibraryEntry[]>(`/library?${new URLSearchParams(params).toString()}`)
      : local().then((l) => l.library(params)),
};
