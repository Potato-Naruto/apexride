import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import type { RouteData } from '../../shared/types';
import { wrap } from '../util';

export const shareRouter = Router();

const TTL = 7 * 24 * 3600 * 1000;
const shares = new Map<string, { route: RouteData; created: number }>();
// No O/0/I/1 so codes survive being read aloud over an intercom.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  for (;;) {
    const bytes = randomBytes(6);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
    if (!shares.has(code)) return code;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of shares) if (now - v.created > TTL) shares.delete(k);
}, 3600_000).unref();

export const getShared = (code: string) => shares.get(code.toUpperCase())?.route;

/** POST /api/share { route } -> { code } */
shareRouter.post(
  '/share',
  wrap(async (req, res) => {
    const route = (req.body as { route?: RouteData }).route;
    if (!route?.geometry?.length || !Array.isArray(route.maneuvers)) return res.status(400).json({ error: 'Invalid route' });
    const code = newCode();
    shares.set(code, { route, created: Date.now() });
    res.status(201).json({ code });
  }),
);

/** GET /api/share/:code -> RouteData */
shareRouter.get(
  '/share/:code',
  wrap(async (req, res) => {
    const route = getShared(req.params.code);
    if (!route) return res.status(404).json({ error: 'Link expired or not found' });
    res.json(route);
  }),
);
