import type { RouteData } from '../../shared/types';
import { MI } from '../../shared/geo';
import type { Progress } from '../hooks/useRouteProgress';
import { spokenDistance, spokenDuration } from './phrasing';

export type Query = 'next-turn' | 'distance' | 'road' | 'remaining' | 'eta' | 'repeat' | 'mute' | 'unmute';

/** Map free speech from the recogniser to an intent. */
export function parseQuery(raw: string): Query | null {
  const s = raw.toLowerCase();
  if (/\b(repeat|say that again)\b/.test(s)) return 'repeat';
  if (/\b(unmute|talk again)\b/.test(s)) return 'unmute';
  if (/\b(mute|be quiet|stop talking)\b/.test(s)) return 'mute';
  if (/(how far|miles|distance).*(destination|end|go|left)|miles left/.test(s)) return 'remaining';
  if (/\b(eta|how long|time (left|remaining)|when.*arrive)\b/.test(s)) return 'eta';
  if (/how far|distance|how many (miles|feet)/.test(s)) return 'distance';
  if (/(next|upcoming) (turn|maneuver|exit)|what'?s next|where do i turn/.test(s)) return 'next-turn';
  if (/(what|which) road|where am i/.test(s)) return 'road';
  return null;
}

export function answer(q: Query, route: RouteData, p: Progress): string {
  const m = p.next;
  switch (q) {
    case 'next-turn':
      if (!m) return 'No upcoming turns.';
      return `In ${spokenDistance(m.at - p.along)}, ${m.text}.${p.after ? ` Then ${p.after.text}.` : ''}`;
    case 'distance':
      return m ? `${spokenDistance(m.at - p.along)} to the next turn.` : 'No upcoming turns.';
    case 'road':
      return p.currentRoad ? `You are on ${p.currentRoad}.` : 'Road name unavailable.';
    case 'remaining':
      return `${spokenDistance(route.distance - p.along)} to go.`;
    case 'eta': {
      const frac = (route.distance - p.along) / (route.distance || 1);
      return `About ${spokenDuration(route.duration * frac)} remaining.`;
    }
    default:
      return '';
  }
}

export const milesLeft = (route: RouteData, p: Progress) => (route.distance - p.along) / MI;
