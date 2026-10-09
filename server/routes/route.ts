import { Router } from 'express';
import type { LatLng, RoutePreference } from '../../shared/types';
import { buildRoute, buildTrackRoute } from '../services/routing';
import { parseGeoJson, parseGoogleMapsUrl, parseGpx, thinWaypoints, type Imported } from '../services/importers';
import { wrap } from '../util';

export const routeRouter = Router();

const validPoint = (p: any): p is LatLng =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/** POST /api/route  { waypoints: LatLng[], prefer?: 'fastest'|'curvy', name? } -> RouteData */
routeRouter.post(
  '/route',
  wrap(async (req, res) => {
    const { waypoints, prefer = 'fastest', name } = req.body as { waypoints: LatLng[]; prefer?: RoutePreference; name?: string };
    if (!Array.isArray(waypoints) || !waypoints.every(validPoint)) return res.status(400).json({ error: 'Invalid waypoints' });
    res.json(await buildRoute(waypoints, prefer === 'curvy' ? 'curvy' : 'fastest', name));
  }),
);

/**
 * POST /api/import  { url } | { gpx } | { geojson }  (+ optional prefer, keepTrack)
 * Always returns a single continuous RouteData with no intermediate arrivals.
 */
routeRouter.post(
  '/import',
  wrap(async (req, res) => {
    const { url, gpx, geojson, prefer = 'fastest', keepTrack = false } = req.body as {
      url?: string; gpx?: string; geojson?: unknown; prefer?: RoutePreference; keepTrack?: boolean;
    };
    let imported: Imported;
    if (url) {
      const g = await parseGoogleMapsUrl(url);
      imported = { kind: 'waypoints', ...g };
    } else if (gpx) imported = parseGpx(gpx);
    else if (geojson) imported = parseGeoJson(geojson);
    else return res.status(400).json({ error: 'Provide url, gpx or geojson' });

    if (imported.kind === 'track') {
      // keepTrack = ride the file exactly as recorded; otherwise snap it to roads for proper turn cues.
      if (keepTrack) return res.json(buildTrackRoute(imported.coords, imported.name));
      return res.json(await buildRoute(thinWaypoints(imported.coords), prefer, imported.name));
    }
    res.json(await buildRoute(imported.waypoints, prefer, imported.name));
  }),
);
