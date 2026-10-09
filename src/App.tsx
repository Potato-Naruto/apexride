import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { Compass, Map as MapIcon, Navigation, Users } from 'lucide-react';
import type { LatLng } from '../shared/types';
import { snapToRoute } from '../shared/geo';
import { MapView } from './components/MapView';
import { PlanPanel } from './components/PlanPanel';
import { RideHUD } from './components/RideHUD';
import { GroupPanel, getRiderName } from './components/GroupPanel';
import { DiscoverPanel } from './components/DiscoverPanel';
import { usePositionSource } from './hooks/usePosition';
import { useRouteProgress } from './hooks/useRouteProgress';
import { useAudioNav } from './hooks/useAudioNav';
import { useVoiceQuery } from './hooks/useVoiceQuery';
import { takeDeepLinkCommand, useIntercomButton } from './hooks/useIntercomButton';
import { useGroupSession } from './hooks/useGroupSession';
import { useWakeLock } from './hooks/useWakeLock';
import { api } from './lib/api';
import { restoreRoute, useApp, type Tab } from './store';

const TABS: { id: Tab; label: string; Icon: typeof MapIcon }[] = [
  { id: 'plan', label: 'Plan', Icon: MapIcon },
  { id: 'ride', label: 'Ride', Icon: Navigation },
  { id: 'group', label: 'Group', Icon: Users },
  { id: 'discover', label: 'Discover', Icon: Compass },
];

export function App() {
  const { tab, route, fix, navigating, groupCode, prefer } = useApp();

  usePositionSource();
  const progress = useRouteProgress(route, fix);
  useAudioNav(progress);
  const ask = useVoiceQuery(route, progress);
  useIntercomButton(ask, navigating);
  useGroupSession(getRiderName());
  useWakeLock(navigating);

  // Restore the saved route; handle /join/CODE links and Siri-shortcut ?cmd= deep links.
  useEffect(() => {
    void restoreRoute();
    const code = /^\/join\/([A-Za-z0-9]{6})$/.exec(location.pathname)?.[1]?.toUpperCase();
    if (code) {
      api.shared(code)
        .then((r) => { useApp.getState().setRoute(r); useApp.setState({ groupCode: code, tab: 'group' }); history.replaceState(null, '', import.meta.env.BASE_URL); })
        .catch((e) => useApp.setState({ error: e.message, tab: 'group' }));
    }
    const cmd = takeDeepLinkCommand();
    if (cmd) setTimeout(() => ask(cmd), 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatic reroute. Remaining stops are kept, so the "single continuous route" survives a wrong turn.
  const lastReroute = useRef(0);
  useEffect(() => {
    if (!progress?.offRoute || !navigating || !route || !fix) return;
    if (Date.now() - lastReroute.current < 20_000) return;
    lastReroute.current = Date.now();
    const remaining: LatLng[] = route.waypoints.filter(
      (w, i) => i > 0 && snapToRoute(w, route.geometry, route.cumulative, 0, route.geometry.length).along > progress.along + 50,
    );
    if (!remaining.length) remaining.push(route.waypoints[route.waypoints.length - 1]);
    api.route([{ lat: fix.lat, lng: fix.lng }, ...remaining], prefer, route.name)
      .then((r) => useApp.getState().setRoute(r))
      .catch(() => { lastReroute.current = 0; /* offline: keep the old line, retry next fix */ });
  }, [progress?.offRoute, navigating, route, fix, prefer]);

  // Swipe left/right on the sheet to move between tabs (big, glove-friendly gesture).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onStart = (e: TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onEnd = (e: TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const i = TABS.findIndex((x) => x.id === tab) + (dx < 0 ? 1 : -1);
    if (TABS[i]) useApp.getState().setTab(TABS[i].id);
  };

  // While riding, keep the sheet short so the map stays visible.
  const compact = tab === 'ride' && navigating;
  const error = useApp((s) => s.error);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="fixed inset-0 bg-black text-white">
      <MapView />

      {/* Phones (portrait): bottom sheet. Tablets / desktop / landscape: left side panel. */}
      <div
        id="sheet"
        className="absolute z-20 inset-x-0 bottom-0 flex flex-col side:inset-y-0 side:right-auto side:w-[min(26rem,46vw)] side:border-r-2 side:border-edge"
      >
        <button
          aria-label={collapsed ? 'Show controls' : 'Hide controls'}
          onClick={() => setCollapsed(!collapsed)}
          className="side:hidden h-7 w-full grid place-items-center bg-black/92 rounded-t-3xl border-t-2 border-x-2 border-edge"
        >
          <span className="block w-12 h-1.5 rounded-full bg-neutral-500" />
        </button>

        <div
          onTouchStart={onStart}
          onTouchEnd={onEnd}
          className={`overflow-y-auto overscroll-contain bg-black/92 backdrop-blur px-4 pt-3 pb-4 side:pt-safe side:flex-1 side:min-h-0 side:max-h-none ${
            collapsed ? 'hidden side:block' : compact ? 'max-h-[42dvh]' : 'max-h-[58dvh]'
          }`}
        >
          {error && (
            <button onClick={() => useApp.setState({ error: null })} className="w-full mb-3 text-left bg-warn text-black font-bold p-3 rounded-xl">
              {error} <span className="opacity-60 font-normal">(tap to dismiss)</span>
            </button>
          )}
          {tab === 'plan' && <PlanPanel />}
          {tab === 'ride' && <RideHUD progress={progress} ask={ask} />}
          {tab === 'group' && <GroupPanel />}
          {tab === 'discover' && <DiscoverPanel />}
        </div>

        <nav className="grid grid-cols-4 bg-black border-t-2 border-edge pb-safe">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { useApp.getState().setTab(id); setCollapsed(false); }}
              className={`min-h-[64px] flex flex-col items-center justify-center gap-0.5 text-sm font-bold ${tab === id ? 'text-apex' : 'text-neutral-400'}`}
            >
              <Icon size={26} />
              {label}
              {id === 'group' && groupCode && <span className="sr-only">live</span>}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
