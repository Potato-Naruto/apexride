import { useEffect, useRef } from 'react';
import { useApp, type Fix } from '../store';
import { pointAt } from '../../shared/geo';

export const SIM_SPEED = 29; // m/s ~ 65 mph

/**
 * Single source of truth for the rider's position. Writes `fix` into the store from
 * either the real GPS or, in simulate mode, a virtual rider travelling along the route
 * (invaluable for testing audio cues from a desk).
 */
export function usePositionSource() {
  const tracking = useApp((s) => s.navigating || s.locating || !!s.groupCode);
  const simulate = useApp((s) => s.simulate && s.navigating);
  const route = useApp((s) => s.route);
  const last = useRef<Fix | null>(null);

  // --- real GPS ---
  useEffect(() => {
    if (!tracking || simulate || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const c = p.coords;
        let speed = c.speed ?? NaN;
        const prev = last.current;
        if (!Number.isFinite(speed) && prev) {
          // Some browsers omit speed; derive it from displacement.
          const dt = (p.timestamp - prev.ts) / 1000;
          const dLat = (c.latitude - prev.lat) * 110540;
          const dLng = (c.longitude - prev.lng) * 111320 * Math.cos((c.latitude * Math.PI) / 180);
          speed = dt > 0 ? Math.hypot(dLat, dLng) / dt : 0;
        }
        const fix: Fix = {
          lat: c.latitude,
          lng: c.longitude,
          speed: Number.isFinite(speed) ? Math.max(0, speed) : 0,
          // Heading is unreliable when nearly stopped; keep the previous one.
          heading: c.heading != null && Number.isFinite(c.heading) && speed > 1.5 ? c.heading : prev?.heading ?? 0,
          accuracy: c.accuracy,
          ts: p.timestamp,
        };
        last.current = fix;
        useApp.setState({ fix });
      },
      (e) => useApp.setState({ error: `GPS: ${e.message}` }),
      { enableHighAccuracy: true, maximumAge: 500, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking, simulate]);

  // --- simulated rider ---
  useEffect(() => {
    if (!simulate || !route) return;
    let along = 0;
    const id = setInterval(() => {
      along = Math.min(route.distance, along + SIM_SPEED);
      const p = pointAt(route.geometry, route.cumulative, along);
      useApp.setState({ fix: { lat: p.lat, lng: p.lng, speed: SIM_SPEED, heading: p.heading, accuracy: 5, ts: Date.now() } });
      if (along >= route.distance) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [simulate, route]);
}
