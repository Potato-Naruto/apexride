import { useState } from 'react';
import { LocateFixed, LogOut, MapPin, Share2, Users } from 'lucide-react';
import type { LatLng } from '../../shared/types';
import { api, SERVER_MODE } from '../lib/api';
import { fmtDuration, toMph } from '../lib/format';
import { useApp } from '../store';
import { Btn, Field, Section } from './ui';

const NAME_KEY = 'apex:name';
export const getRiderName = () => { try { return localStorage.getItem(NAME_KEY) || 'Rider'; } catch { return 'Rider'; } };

export function GroupPanel() {
  const { route, groupCode, groupHost, awaitingRoute, riders, fix, error } = useApp();
  const [name, setName] = useState(getRiderName());
  const [join, setJoin] = useState('');
  const [busy, setBusy] = useState(false);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true); useApp.setState({ error: null });
    try { await fn(); } catch (e) { useApp.setState({ error: (e as Error).message }); }
    setBusy(false);
  };
  const saveName = (v: string) => { setName(v); try { localStorage.setItem(NAME_KEY, v); } catch { /* private mode */ } };
  const link = groupCode ? `${location.origin}${import.meta.env.BASE_URL}?join=${groupCode}` : '';

  const host = () => guard(async () => {
    const { code } = await api.share(route!);
    useApp.setState({ groupCode: code, groupHost: true, awaitingRoute: false });
  });
  const joinRide = () => guard(async () => {
    const code = join.trim().toUpperCase();
    if (SERVER_MODE) {
      useApp.getState().setRoute(await api.shared(code));
      useApp.setState({ groupCode: code, groupHost: false, awaitingRoute: false });
    } else {
      // Peer-to-peer: the route arrives from the host's device once we are in the room.
      useApp.setState({ groupCode: code, groupHost: false, awaitingRoute: true });
    }
  });
  const share = () => navigator.share ? navigator.share({ title: 'Ride with me on ApexRide', url: link }).catch(() => {}) : navigator.clipboard.writeText(link);

  return (
    <div className="space-y-5">
      <Section title="Rider name"><Field value={name} onChange={(e) => saveName(e.target.value)} maxLength={24} /></Section>

      {!groupCode ? (
        <>
          <Section title="Host a group ride">
            <Btn variant="primary" className="w-full" disabled={!route || busy} onClick={host}><Share2 /> Share this route live</Btn>
            {!route && <p className="text-neutral-400 text-sm">Build a route first.</p>}
          </Section>
          <Section title="Join">
            <div className="flex gap-2">
              <Field placeholder="Ride code" value={join} onChange={(e) => setJoin(e.target.value.toUpperCase())} maxLength={6} className="tracking-[0.3em] uppercase" />
              <Btn variant="primary" disabled={join.length < 6 || busy} onClick={joinRide}>Join</Btn>
            </div>
          </Section>
        </>
      ) : (
        <Section title="Live ride">
          <div className="rounded-2xl border-2 border-apex p-4 text-center">
            <div className="text-sm text-neutral-400">Ride code (say it over the intercom)</div>
            <div className="text-5xl font-extrabold tracking-[0.25em]">{groupCode}</div>
          </div>
          <div className="flex gap-2">
            <Btn className="flex-1" onClick={share}><Share2 /> Share link</Btn>
            <Btn variant="ghost" onClick={() => useApp.setState({ groupCode: null, groupHost: false, awaitingRoute: false })}><LogOut /> Leave</Btn>
          </div>
          {awaitingRoute && <p className="text-apex font-semibold">Waiting for the host to send the route… the host needs to keep ApexRide open.</p>}
          {!SERVER_MODE && !awaitingRoute && <p className="text-neutral-400 text-sm">{groupHost ? 'Riders connect directly to you, so keep ApexRide open.' : 'Connected directly to the host.'}</p>}
          <ul className="space-y-2">
            {Object.values(riders).map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-lg">
                <span className="w-4 h-4 rounded-full" style={{ background: r.color }} />
                <span className="flex-1">{r.name}</span>
                <span className="text-neutral-400 tabular-nums">{Number.isFinite(r.lat) ? `${toMph(r.speed)} mph` : 'no GPS yet'}</span>
              </li>
            ))}
            {Object.keys(riders).length === 0 && <li className="text-neutral-400 flex gap-2"><Users /> Waiting for riders to join…</li>}
          </ul>
        </Section>
      )}

      {error && <p className="text-warn font-semibold">{error}</p>}
      <Midpoint me={fix} />
    </div>
  );
}

/** Fair-midpoint finder: add 2+ starting places, get a rendezvous with equalised ride times. */
function Midpoint({ me }: { me: LatLng | null }) {
  const [pts, setPts] = useState<{ label: string; p: LatLng }[]>([]);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ point: LatLng; etas: number[]; spread: number } | null>(null);
  const [msg, setMsg] = useState('');

  const add = async () => {
    setMsg('');
    try {
      const [h] = await api.geocode(q);
      if (!h) return setMsg('Place not found');
      setPts([...pts, { label: h.label.split(',').slice(0, 2).join(','), p: h }]); setQ(''); setRes(null);
    } catch (e) { setMsg((e as Error).message); }
  };
  const find = async () => {
    setMsg('Calculating…');
    try { setRes(await api.midpoint(pts.map((x) => x.p))); setMsg(''); } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <Section title="Fair midpoint">
      <div className="flex gap-2">
        <Field placeholder="Rider's starting place" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Btn onClick={add} aria-label="Add"><MapPin /></Btn>
        {me && <Btn aria-label="Use my location" onClick={() => { setPts([...pts, { label: 'My location', p: me }]); setRes(null); }}><LocateFixed /></Btn>}
      </div>
      {pts.map((x, i) => (
        <div key={i} className="flex items-center gap-2 text-neutral-200">
          <span className="flex-1 truncate">{i + 1}. {x.label}</span>
          {res && <span className="text-apex font-bold">{fmtDuration(res.etas[i])}</span>}
        </div>
      ))}
      <Btn variant="primary" className="w-full" disabled={pts.length < 2} onClick={find}>Find meeting point</Btn>
      {msg && <p className="text-neutral-400">{msg}</p>}
      {res && (
        <Btn className="w-full" onClick={() => {
          const s = useApp.getState();
          s.setWaypoints([...s.waypoints, res.point]); s.setTab('plan');
        }}>
          Add meeting point as stop · ±{Math.round(res.spread / 60)} min apart
        </Btn>
      )}
    </Section>
  );
}
