import { useEffect, useRef } from 'react';
import type { Progress } from './useRouteProgress';
import { evaluateAlerts, newAlertState, speechRate } from '../audio/alertSchedule';
import { speak } from '../audio/engine';
import { useApp } from '../store';

/**
 * Fires distance- and speed-aware voice cues as progress updates.
 * Pure scheduling logic lives in audio/alertSchedule.ts (unit tested).
 */
export function useAudioNav(progress: Progress | null) {
  const voiceOn = useApp((s) => s.voiceOn);
  const navigating = useApp((s) => s.navigating);
  const fix = useApp((s) => s.fix);
  const state = useRef(newAlertState());
  const spokenArrive = useRef(false);

  useEffect(() => {
    state.current = newAlertState();
    spokenArrive.current = false;
  }, [navigating]);

  useEffect(() => {
    if (!progress) {
      // Route changed (reroute / new route): maneuver ids restart, so forget what we've said.
      state.current = newAlertState();
      spokenArrive.current = false;
    }
    if (!navigating || !progress) return;
    const speed = fix?.speed ?? 0;
    const alert = evaluateAlerts(state.current, progress.along, speed, progress.next, progress.prev);
    if (alert && voiceOn) speak(alert.text, { rate: speechRate(speed), chime: alert.chime });
    if (progress.finished && !spokenArrive.current) {
      spokenArrive.current = true;
      if (voiceOn) speak('You have arrived.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.along, progress === null]);
}
