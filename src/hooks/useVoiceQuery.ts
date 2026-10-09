import { useCallback, useEffect, useRef } from 'react';
import type { RouteData } from '../../shared/types';
import type { Progress } from './useRouteProgress';
import { answer, parseQuery, type Query } from '../audio/status';
import { lastSpoken, speak } from '../audio/engine';
import { useApp } from '../store';

/**
 * Answers spoken questions ("what's my next turn?") and intercom/media-key presses.
 *
 *  - Speech recognition is opt-in (`listenOn`): open-mic use competes with the
 *    Bluetooth headset's audio profile on some intercoms.
 *  - Media keys: the silent <audio> in engine.ts registers us as a media session, so a
 *    headset's play/pause/next button reads the next turn (see useIntercomButton).
 *  - Siri/Shortcuts: a shortcut that opens `/?cmd=next-turn` triggers the same path.
 */
export function useVoiceQuery(route: RouteData | null, progress: Progress | null) {
  const listenOn = useApp((s) => s.listenOn);
  const ctx = useRef({ route, progress });
  ctx.current = { route, progress };

  /** Run an intent and speak the result. */
  const ask = useCallback((q: Query) => {
    const { route, progress } = ctx.current;
    if (q === 'repeat') return speak(lastSpoken() || 'Nothing to repeat.');
    if (q === 'mute') {
      speak('Voice muted.');
      return useApp.setState({ voiceOn: false });
    }
    if (q === 'unmute') {
      useApp.setState({ voiceOn: true });
      return speak('Voice on.');
    }
    if (!route || !progress) return speak('Navigation is not active.');
    speak(answer(q, route, progress));
  }, []);

  useEffect(() => {
    if (!listenOn) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      useApp.setState({ listenOn: false, error: 'Voice commands are not supported in this browser' });
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || 'en-US';
    let stopped = false;
    rec.onresult = (e: any) => {
      const text: string = e.results[e.results.length - 1][0].transcript;
      const q = parseQuery(text);
      if (q) ask(q);
    };
    // Recognition ends on its own after silence/network blips; restart while enabled.
    rec.onend = () => {
      if (!stopped) setTimeout(() => { try { rec.start(); } catch { /* already started */ } }, 300);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        stopped = true;
        useApp.setState({ listenOn: false, error: 'Microphone permission denied' });
      }
    };
    try { rec.start(); } catch { /* ignore */ }
    return () => {
      stopped = true;
      rec.abort();
    };
  }, [listenOn, ask]);

  return ask;
}
