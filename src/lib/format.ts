import { MI } from '../../shared/geo';

export const toMph = (ms: number) => Math.round(ms * 2.23694);

export function fmtDist(m: number): string {
  if (m < 0.2 * MI) return `${Math.max(50, Math.round((m * 3.28084) / 50) * 50)} ft`;
  const mi = m / MI;
  return `${mi >= 10 ? Math.round(mi) : mi.toFixed(1)} mi`;
}

export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const fmtClock = (secFromNow: number) =>
  new Date(Date.now() + secFromNow * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
