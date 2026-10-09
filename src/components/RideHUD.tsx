import { ArrowLeft, ArrowRight, ArrowUp, Crosshair, CornerUpLeft, CornerUpRight, Flag, Mic, MicOff, Play, RotateCw, Square, Undo2, Volume2, VolumeX } from 'lucide-react';
import type { Maneuver } from '../../shared/types';
import type { Progress } from '../hooks/useRouteProgress';
import type { Query } from '../audio/status';
import { fmtClock, fmtDist, toMph } from '../lib/format';
import { stopAudio } from '../audio/engine';
import { useApp } from '../store';
import { Btn } from './ui';

function TurnIcon({ m, size = 64 }: { m?: Maneuver; size?: number }) {
  const mod = m?.modifier ?? '';
  if (m?.type === 'arrive') return <Flag size={size} />;
  if (m?.type === 'roundabout' || m?.type === 'rotary') return <RotateCw size={size} />;
  if (mod.includes('uturn')) return <Undo2 size={size} />;
  if (mod.includes('sharp')) return mod.includes('left') ? <CornerUpLeft size={size} /> : <CornerUpRight size={size} />;
  if (mod.includes('left')) return <ArrowLeft size={size} />;
  if (mod.includes('right')) return <ArrowRight size={size} />;
  return <ArrowUp size={size} />;
}

export function RideHUD({ progress, ask }: { progress: Progress | null; ask: (q: Query) => void }) {
  const { route, navigating, fix, voiceOn, listenOn, simulate, follow } = useApp();
  if (!route) return <p className="text-neutral-400">Plan a route first.</p>;

  const stop = () => { stopAudio(); useApp.setState({ navigating: false, simulate: false }); };
  const speed = fix ? toMph(fix.speed) : 0;
  const etaSec = progress ? route.duration * (progress.remaining / route.distance) : route.duration;

  return (
    <div className="space-y-4">
      {navigating && (
        <div className="rounded-3xl bg-[#101014] border-2 border-apex p-4 flex items-center gap-4">
          <div className="text-apex shrink-0"><TurnIcon m={progress?.next} /></div>
          <div className="min-w-0">
            <div className="text-4xl sm:text-5xl font-extrabold leading-none">{progress?.next ? fmtDist(progress.next.at - progress.along) : '—'}</div>
            <div className="text-xl text-neutral-200 mt-1 capitalize">{progress?.next?.text ?? 'Acquiring GPS…'}</div>
            {progress?.after && <div className="text-neutral-400 mt-1">then {progress.after.text}</div>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="mph" value={String(speed)} big />
        <Stat label="left" value={progress ? fmtDist(progress.remaining) : fmtDist(route.distance)} />
        <Stat label="arrive" value={fmtClock(etaSec)} />
      </div>

      {progress?.offRoute && <p className="text-warn font-bold text-xl">Off route – recalculating…</p>}

      {!navigating ? (
        <Btn variant="primary" className="w-full min-h-[72px] text-2xl" onClick={() => useApp.setState({ navigating: true, follow: true })}><Play /> Resume</Btn>
      ) : (
        <Btn variant="danger" className="w-full min-h-[72px] text-2xl" onClick={stop}><Square /> End ride</Btn>
      )}

      <div className="grid grid-cols-4 gap-2">
        <Btn aria-label="Toggle voice" onClick={() => useApp.setState({ voiceOn: !voiceOn })}>{voiceOn ? <Volume2 /> : <VolumeX />}</Btn>
        <Btn aria-label="Toggle voice commands" className={listenOn ? 'border-go' : ''} onClick={() => useApp.setState({ listenOn: !listenOn })}>{listenOn ? <Mic className="text-go" /> : <MicOff />}</Btn>
        <Btn aria-label="Ask next turn" onClick={() => ask('next-turn')}>Next?</Btn>
        <Btn aria-label="Recenter" className={follow ? '' : 'border-apex'} onClick={() => useApp.setState({ follow: true })}><Crosshair /></Btn>
      </div>

      {import.meta.env.DEV && (
        <Btn variant="ghost" className="w-full text-base" onClick={() => useApp.setState({ simulate: !simulate, navigating: true })}>
          {simulate ? 'Stop simulated ride' : 'Simulate ride at 65 mph (dev)'}
        </Btn>
      )}
    </div>
  );
}

const Stat = ({ label, value, big }: { label: string; value: string; big?: boolean }) => (
  <div className="rounded-2xl bg-[#101014] border-2 border-edge py-3">
    <div className={`${big ? 'text-5xl' : 'text-3xl'} font-extrabold tabular-nums`}>{value}</div>
    <div className="text-xs uppercase tracking-widest text-neutral-400">{label}</div>
  </div>
);
