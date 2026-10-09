import { useEffect } from 'react';
import type { Query } from '../audio/status';

/**
 * Wire headset/intercom buttons and Siri Shortcut deep links to a voice query.
 *
 * Browsers cannot register Siri intents, but two routes work today:
 *  1. Media Session: while our (silent) audio is playing, AVRCP buttons on Sena/Cardo/etc.
 *     arrive as play / pause / nexttrack / previoustrack actions.
 *  2. Deep links: a Siri Shortcut ("Open URL" -> https://your.app/?cmd=next-turn) or the
 *     manifest shortcuts open the PWA with ?cmd=..., which we answer on load.
 */
export function useIntercomButton(ask: (q: Query) => void, active: boolean) {
  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({ title: 'ApexRide navigation', artist: 'Tap for next turn' });
    ms.playbackState = 'playing';
    const bind = (a: MediaSessionAction, q: Query) => {
      try { ms.setActionHandler(a, () => { ask(q); ms.playbackState = 'playing'; }); } catch { /* unsupported */ }
    };
    bind('play', 'next-turn');
    bind('pause', 'next-turn');
    bind('nexttrack', 'distance');
    bind('previoustrack', 'repeat');
    return () => {
      (['play', 'pause', 'nexttrack', 'previoustrack'] as MediaSessionAction[]).forEach((a) => {
        try { ms.setActionHandler(a, null); } catch { /* noop */ }
      });
    };
  }, [active, ask]);
}

const CMDS: Record<string, Query> = { 'next-turn': 'next-turn', distance: 'distance', road: 'road', eta: 'eta', repeat: 'repeat' };

/** Read & clear `?cmd=` from the URL (Siri Shortcut / app shortcut entry point). */
export function takeDeepLinkCommand(): Query | null {
  const url = new URL(location.href);
  const c = url.searchParams.get('cmd');
  if (!c) return null;
  url.searchParams.delete('cmd');
  history.replaceState(null, '', url);
  return CMDS[c] ?? null;
}
