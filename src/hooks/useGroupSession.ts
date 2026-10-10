import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Rider, RouteData } from '../../shared/types';
import { useApp } from '../store';
import { API_URL, SERVER_MODE } from '../lib/api';

const COLORS = ['#ffb400', '#35e06b', '#4da3ff', '#ff4d9d', '#b46bff', '#00e5d4', '#ff7a3d', '#e8e8e8'];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

interface Loc { name: string; lat: number; lng: number; speed: number; heading: number }
interface P2P {
  sendLoc: (m: Loc) => void;
  sendRoute: (r: RouteData, target?: string) => void;
}

/**
 * Joins the live group room for the current ride code, streams our position at <= 1 Hz and
 * keeps `riders` in the store up to date.
 *
 *  - Server mode (dev, or VITE_API_URL set): Socket.io rooms on the ApexRide server.
 *  - Browser mode (static hosting): peer-to-peer over WebRTC via Trystero. No server to run; the
 *    host's device sends the route to riders as they join, so the host must keep the app open.
 */
export function useGroupSession(name: string) {
  const code = useApp((s) => s.groupCode);
  const host = useApp((s) => s.groupHost);
  const route = useApp((s) => s.route);
  const sock = useRef<Socket | null>(null);
  const p2p = useRef<P2P | null>(null);
  const lastSent = useRef(0);

  // --- server mode ---
  useEffect(() => {
    if (!code || !SERVER_MODE) return;
    const s = io(API_URL || undefined, { transports: ['websocket'], reconnectionDelayMax: 5000 });
    sock.current = s;
    const join = () =>
      s.emit('join', { code, name }, (r: { ok: boolean; error?: string; riders?: Rider[]; you?: Rider }) => {
        if (!r.ok) return useApp.setState({ groupCode: null, error: r.error ?? 'Could not join ride' });
        useApp.setState({ riders: Object.fromEntries((r.riders ?? []).map((x) => [x.id, x])) });
      });
    s.on('connect', join); // also re-joins after a signal drop
    s.on('rider', (r: Rider) => useApp.setState((st) => ({ riders: { ...st.riders, [r.id]: r } })));
    s.on('left', (id: string) =>
      useApp.setState((st) => {
        const { [id]: _gone, ...rest } = st.riders;
        return { riders: rest };
      }),
    );
    return () => {
      s.disconnect();
      sock.current = null;
      useApp.setState({ riders: {} });
    };
  }, [code, name]);

  // --- browser mode: peer-to-peer ---
  useEffect(() => {
    if (!code || SERVER_MODE) return;
    let cancelled = false;
    let leave = () => {};
    (async () => {
      const { joinRoom } = await import('trystero'); // loaded only when a ride is joined
      if (cancelled) return;
      const room = joinRoom({ appId: 'apexride-v1' }, code);
      const loc = room.makeAction<any>('loc');
      const rte = room.makeAction<any>('route');

      loc.onMessage = (m: Loc, { peerId }: { peerId: string }) =>
        useApp.setState((st) => ({
          riders: { ...st.riders, [peerId]: { id: peerId, color: colorFor(peerId), ts: Date.now(), ...m } },
        }));
      rte.onMessage = (r: RouteData) => {
        if (useApp.getState().groupHost) return; // the host's route is the source of truth
        useApp.getState().setRoute(r);
        useApp.setState({ awaitingRoute: false });
      };
      // Anyone who joins gets the host's current route.
      room.onPeerJoin = (peerId: string) => {
        const s = useApp.getState();
        if (s.groupHost && s.route) rte.send(s.route, { target: peerId });
      };
      room.onPeerLeave = (peerId: string) =>
        useApp.setState((st) => {
          const { [peerId]: _gone, ...rest } = st.riders;
          return { riders: rest };
        });

      p2p.current = {
        sendLoc: (m) => loc.send(m),
        sendRoute: (r, target) => rte.send(r, target ? { target } : undefined),
      };
      leave = () => room.leave();
    })().catch((e) => useApp.setState({ error: `Group connection failed: ${(e as Error).message}` }));
    return () => {
      cancelled = true;
      leave();
      p2p.current = null;
      useApp.setState({ riders: {} });
    };
  }, [code]);

  // Host: push route changes (e.g. after a reroute) to everyone already in the room.
  useEffect(() => {
    if (!SERVER_MODE && host && route) p2p.current?.sendRoute(route);
  }, [host, route?.id]);

  // Broadcast own position
  const fix = useApp((s) => s.fix);
  useEffect(() => {
    if (!fix || fix.ts - lastSent.current < 1000) return;
    const m = { lat: fix.lat, lng: fix.lng, speed: fix.speed, heading: fix.heading };
    if (sock.current?.connected) sock.current.emit('loc', m);
    else if (p2p.current) p2p.current.sendLoc({ name, ...m });
    else return;
    lastSent.current = fix.ts;
  }, [fix, name]);
}
