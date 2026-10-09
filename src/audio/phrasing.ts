import { MI } from '../../shared/geo';

/** Distance as a rider would say it into an intercom. */
export function spokenDistance(m: number): string {
  const mi = m / MI;
  if (m < 0.18 * MI) {
    const ft = Math.max(100, Math.round((m * 3.28084) / 100) * 100);
    return `${ft} feet`;
  }
  const near = (t: number) => Math.abs(mi - t) < 0.04;
  if (near(1)) return '1 mile';
  if (near(0.75)) return 'three quarters of a mile';
  if (near(0.5)) return 'half a mile';
  if (near(0.25)) return 'a quarter mile';
  if (mi >= 10) return `${Math.round(mi)} miles`;
  return `${mi.toFixed(1)} miles`;
}

export function spokenDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${Math.max(1, min)} minutes`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `${h} hour${h > 1 ? 's' : ''}${r ? ` ${r} minutes` : ''}`;
}
