// Browser-side implementations of the server endpoints (same code, run in the page).
import type { LatLng, LibraryEntry, RoutePreference } from '../../shared/types';
import { filterLibrary, type LibraryQuery } from '../../shared/librarySearch';
import { buildRoute } from '../../server/services/routing';
import { geocode as geocodeImpl } from '../../server/services/geocode';
import { fairMidpoint } from '../../server/services/midpoint';
import { parseGeoJson, parseGoogleMapsUrl, parseGpx, thinWaypoints } from '../../server/services/importers';
import seed from '../../server/data/library.seed.json';

export const route = (waypoints: LatLng[], prefer: RoutePreference, name?: string) => buildRoute(waypoints, prefer, name);
export const geocode = (q: string) => (q.trim().length < 2 ? Promise.resolve([]) : geocodeImpl(q));
export const midpoint = (riders: LatLng[]) => fairMidpoint(riders);

/** Full Google Maps directions links only: the browser can't follow short-link redirects (CORS). */
export async function importUrl(raw: string, prefer: RoutePreference) {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error('That is not a valid link.'); }
  if (/(^|.)(goo.gl|g.co)$/i.test(u.hostname))
    throw new Error("Short links (maps.app.goo.gl) can't be opened from the browser. Open the link in Google Maps, copy the full address-bar URL (it contains /maps/dir/) and paste that instead.");
  if (!u.pathname.includes('/maps/dir') && !u.searchParams.get('destination'))
    throw new Error('Paste a Google Maps directions link (it contains /maps/dir/).');
  const g = await parseGoogleMapsUrl(u.href);
  return buildRoute(g.waypoints, prefer, g.name);
}

export async function importFile(text: string, prefer: RoutePreference) {
  const imported = text.trimStart().startsWith('{') ? parseGeoJson(JSON.parse(text)) : parseGpx(text);
  return imported.kind === 'track'
    ? buildRoute(thinWaypoints(imported.coords), prefer, imported.name)
    : buildRoute(imported.waypoints, prefer, imported.name);
}

const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));
export async function library(p: Record<string, string>): Promise<LibraryEntry[]> {
  const q: LibraryQuery = {
    q: p.q, region: p.region, sort: (p.sort as LibraryQuery['sort']) ?? 'rating',
    minRating: num(p.minRating), minLengthKm: num(p.minLengthKm), maxLengthKm: num(p.maxLengthKm), minCurviness: num(p.minCurviness),
  };
  return filterLibrary(seed as LibraryEntry[], q);
}

