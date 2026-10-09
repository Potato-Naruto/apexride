import type { Maneuver } from '../../shared/types';
import { MI } from '../../shared/geo';
import { spokenDistance } from './phrasing';

export const MPH = 0.44704;
/** Above this speed (~56 mph) riders get an extra 1-mile heads-up and terser phrasing. */
export const HIGHWAY_SPEED = 25;
const REASSURE_EVERY = 10 * MI;
const REASSURE_MIN_REMAINING = 1.2 * MI;

export interface AlertState {
  maneuverId: number | null;
  fired: Set<string>;
  lastReassureAlong: number;
}

export interface Alert {
  kind: 'turn' | 'reassure';
  text: string;
  chime: boolean;
  key: string;
}

export const newAlertState = (): AlertState => ({ maneuverId: null, fired: new Set(), lastReassureAlong: 0 });

interface Step {
  key: string;
  dist: number;
  final?: boolean;
}

/**
 * Warning ladder for one maneuver, nearest last.
 *   0.75 / 0.5 / 0.25 mi, then a final warning at max(0.1 mi, 8 s of travel)
 *   so a rider at 70 mph (31 m/s) gets ~250 m instead of 160 m.
 *   Highway speeds also get a 1 mile heads-up.
 */
export function ladder(speed: number): Step[] {
  const steps: Step[] = [];
  if (speed >= HIGHWAY_SPEED) steps.push({ key: '1', dist: 1 * MI });
  steps.push({ key: '.75', dist: 0.75 * MI }, { key: '.5', dist: 0.5 * MI }, { key: '.25', dist: 0.25 * MI });
  steps.push({ key: 'final', dist: Math.max(0.1 * MI, speed * 8), final: true });
  return steps;
}

/** Speech-rate multiplier: a bit faster at speed so the cue finishes before the turn. */
export function speechRate(speed: number): number {
  const mph = speed / MPH;
  return Math.max(0.95, Math.min(1.35, 1 + (mph - 30) / 100));
}

/**
 * Decide whether to speak now. Call on every position update; the returned alert
 * (if any) must be spoken, and state is mutated to prevent repeats.
 */
export function evaluateAlerts(
  st: AlertState,
  along: number,
  speed: number,
  next: Maneuver | undefined,
  prev: Maneuver | undefined,
): Alert | null {
  if (!next) return null;

  if (st.maneuverId !== next.id) {
    st.maneuverId = next.id;
    st.fired = new Set();
    st.lastReassureAlong = along; // count 10 miles from first sight of this leg
  }
  const remaining = next.at - along;
  if (remaining < 0) return null;

  const fast = speed >= HIGHWAY_SPEED;
  const action = next.type === 'arrive' ? 'you will arrive at your destination' : next.text;

  // --- turn warnings ---
  const crossed = ladder(speed).filter((s) => remaining <= s.dist && !st.fired.has(s.key));
  if (crossed.length) {
    crossed.forEach((s) => st.fired.add(s.key));
    const nearest = crossed[crossed.length - 1];
    // Joined mid-ladder (route start, reroute): don't announce a rung we already blew past.
    const tolerance = Math.max(0.05 * MI, speed * 3);
    if (nearest.dist - remaining <= tolerance) {
      const where = spokenDistance(nearest.final ? remaining : nearest.dist);
      const text = nearest.final && fast ? `${action}` : `In ${where}, ${action}`;
      return { kind: 'turn', text, chime: false, key: `${next.id}:${nearest.key}` };
    }
    return null;
  }

  // --- reassurance on long straights, so riders know the intercom link is alive ---
  if (remaining > REASSURE_MIN_REMAINING && along - st.lastReassureAlong >= REASSURE_EVERY) {
    st.lastReassureAlong = along;
    const miles = Math.round(remaining / MI);
    return {
      kind: 'reassure',
      text: `Continue ${currentRoadPhrase(prev)} for another ${miles} ${miles === 1 ? 'mile' : 'miles'}`,
      chime: true,
      key: `${next.id}:r${Math.floor(along / REASSURE_EVERY)}`,
    };
  }
  return null;
}

/** "on Hwy 105" if we know the road we are currently on (the road after the previous maneuver). */
function currentRoadPhrase(prev: Maneuver | undefined): string {
  return prev?.road ? `on ${prev.road}` : 'straight ahead';
}
