import type { Server } from 'socket.io';
import type { Rider } from '../shared/types';
import { getShared } from './routes/share';

const COLORS = ['#ffb400', '#35e06b', '#4da3ff', '#ff4d9d', '#b46bff', '#00e5d4', '#ff7a3d', '#e8e8e8'];

interface Room {
  riders: Map<string, Rider>;
}
const rooms = new Map<string, Room>();

const num = (v: unknown, fallback = 0) => (Number.isFinite(v) ? (v as number) : fallback);

/**
 * Group tracking protocol (room = share code):
 *   client -> 'join'  { code, name }          ack { ok, you, riders[] } | { ok:false, error }
 *   client -> 'loc'   { lat, lng, speed, heading }
 *   server -> 'rider' Rider                   (position update)
 *   server -> 'left'  riderId
 * Swap this file for Supabase Realtime channels if you prefer a hosted backend;
 * the client hook (useGroupSession) is the only consumer.
 */
export function attachSockets(io: Server) {
  io.on('connection', (socket) => {
    let code: string | null = null;

    socket.on('join', (msg: { code?: string; name?: string }, ack?: (r: unknown) => void) => {
      const c = String(msg?.code ?? '').toUpperCase();
      if (!getShared(c)) return ack?.({ ok: false, error: 'Unknown ride code' });
      const room = rooms.get(c) ?? { riders: new Map<string, Rider>() };
      if (room.riders.size >= 12) return ack?.({ ok: false, error: 'Ride is full' });
      rooms.set(c, room);
      code = c;
      socket.join(c);
      const you: Rider = {
        id: socket.id,
        name: String(msg?.name ?? 'Rider').slice(0, 24) || 'Rider',
        color: COLORS[room.riders.size % COLORS.length],
        lat: NaN, lng: NaN, speed: 0, heading: 0, ts: Date.now(),
      };
      room.riders.set(socket.id, you);
      ack?.({ ok: true, you, riders: [...room.riders.values()].filter((r) => Number.isFinite(r.lat)) });
    });

    socket.on('loc', (m: { lat: number; lng: number; speed?: number; heading?: number }) => {
      if (!code) return;
      const r = rooms.get(code)?.riders.get(socket.id);
      if (!r || !Number.isFinite(m?.lat) || !Number.isFinite(m?.lng)) return;
      Object.assign(r, { lat: m.lat, lng: m.lng, speed: num(m.speed), heading: num(m.heading), ts: Date.now() });
      socket.to(code).emit('rider', r);
    });

    socket.on('disconnect', () => {
      if (!code) return;
      const room = rooms.get(code);
      room?.riders.delete(socket.id);
      io.to(code).emit('left', socket.id);
      if (room && room.riders.size === 0) rooms.delete(code);
    });
  });
}
