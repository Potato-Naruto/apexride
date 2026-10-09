import { Router } from 'express';
import type { LatLng } from '../../shared/types';
import { geocode } from '../services/geocode';
import { fairMidpoint } from '../services/midpoint';
import { wrap } from '../util';

export const placesRouter = Router();

/** GET /api/geocode?q=... */
placesRouter.get(
  '/geocode',
  wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json([]);
    res.json(await geocode(q));
  }),
);

/** POST /api/midpoint { riders: LatLng[] } -> { point, etas, spread } */
placesRouter.post(
  '/midpoint',
  wrap(async (req, res) => {
    const riders = (req.body as { riders?: LatLng[] }).riders;
    if (!Array.isArray(riders) || riders.length < 2 || riders.length > 8) return res.status(400).json({ error: '2-8 riders required' });
    res.json(await fairMidpoint(riders));
  }),
);
