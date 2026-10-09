import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Rider } from '../../shared/types';
import { useApp } from '../store';
import { API_URL } from '../lib/api';

/**
 * Joins the live group room for the current share code, streams our position at
 * <= 1 Hz and keeps `riders` in the store up to date. Transport is Socket.io; to use
 * Supabase Realtime instead, replace the socket calls here (broadcast channel per code).
 */
export function useGroupSession(name: string) {
  const code = useApp((s) => s.groupCode);
  const sock = useRef<Socket | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!code) return;
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

  // Broadcast own position
  const fix = useApp((s) => s.fix);
  useEffect(() => {
    if (!fix || !sock.current?.connected) return;
    if (fix.ts - lastSent.current < 1000) return;
    lastSent.current = fix.ts;
    sock.current.emit('loc', { lat: fix.lat, lng: fix.lng, speed: fix.speed, heading: fix.heading });
  }, [fix]);
}
