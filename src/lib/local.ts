// Browser-side implementations of the server endpoints (same code, run in the page).
import type { LatLng, LibraryEntry, RoutePreference } from '../../shared/types';
import { filterLibrary, type LibraryQuery } from '../../shared/librarySearch';
import { buildRoute } from '../../server/services/routing';
import { geocode as geocodeImpl } from '../../server/services/geocode';
import { fairMidpoint } from '../../server/services/midpoint';
import { parseGeoJson, parseGpx, thinWaypoints } from '../../server/services/importers';
import seed from '../../server/data/library.seed.json';

export const route = (waypoints: LatLng[], prefer: RoutePreference, name?: string) => buildRoute(waypoints, prefer, name);
export const geocode = (q: string) => (q.trim().length < 2 ? Promise.resolve([]) : geocodeImpl(q));
export const midpoint = (riders: LatLng[]) => fairMidpoint(riders);

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

