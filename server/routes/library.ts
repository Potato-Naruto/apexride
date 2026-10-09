import { Router } from 'express';
import type { LibraryEntry } from '../../shared/types';
import { addEntry, search } from '../services/library';
import { parseGeoJson, parseGpx, thinWaypoints } from '../services/importers';
import { cumulativeDistances, curvinessIndex } from '../../shared/geo';
import { wrap } from '../util';

export const libraryRouter = Router();

const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));

/** GET /api/library?q=&region=&minRating=&minLengthKm=&maxLengthKm=&minCurviness=&sort=rating|length|curviness */
libraryRouter.get(
  '/library',
  wrap(async (req, res) => {
    const q = req.query;
    res.json(
      await search({
        q: q.q as string,
        region: q.region as string,
        minRating: num(q.minRating),
        minLengthKm: num(q.minLengthKm),
        maxLengthKm: num(q.maxLengthKm),
        minCurviness: num(q.minCurviness),
        sort: (q.sort as any) ?? 'rating',
      }),
    );
  }),
);

/** POST /api/library  { gpx | geojson, name?, city?, region?, country?, tags? } - contribute a route. */
libraryRouter.post(
  '/library',
  wrap(async (req, res) => {
    const b = req.body as any;
    const parsed = b.gpx ? parseGpx(b.gpx) : b.geojson ? parseGeoJson(b.geojson) : null;
    if (!parsed) return res.status(400).json({ error: 'Provide gpx or geojson' });
    const coords =
      parsed.kind === 'track' ? parsed.coords : parsed.waypoints.map((p) => [p.lng, p.lat] as [number, number]);
    const cum = cumulativeDistances(coords);
    const entry: LibraryEntry = {
      id: `u_${Date.now().toString(36)}`,
      name: String(b.name ?? parsed.name).slice(0, 120),
      city: String(b.city ?? '').slice(0, 80),
      region: String(b.region ?? '').slice(0, 80),
      country: String(b.country ?? '').slice(0, 2).toUpperCase(),
      lengthKm: Math.round(cum[cum.length - 1] / 100) / 10,
      rating: 0,
      curviness: curvinessIndex(coords, cum),
      tags: Array.isArray(b.tags) ? b.tags.slice(0, 8).map(String) : [],
      source: 'community',
      waypoints: thinWaypoints(coords, 20),
    };
    await addEntry(entry);
    res.status(201).json(entry);
  }),
);
