import { useRef, useState } from 'react';
import { ArrowUp, Copy, Download, ExternalLink, FileUp, Link2, Navigation, Plus, Search, Trash2, Waves } from 'lucide-react';
import { googleMapsLinks } from '../../shared/googleLink';
import type { LatLng } from '../../shared/types';
import { api } from '../lib/api';
import { buildProgressive } from '../lib/build';
import { fmtDist, fmtDuration } from '../lib/format';
import { prefetchTiles } from '../hooks/useMap';
import { unlockAudio } from '../audio/engine';
import { useApp } from '../store';
import { Btn, Chip, Field, Section } from './ui';

export function PlanPanel() {
  const { waypoints, setWaypoints, route, setRoute, prefer, building, error } = useApp();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<(LatLng & { label: string })[]>([]);
  const [url, setUrl] = useState('');
  const [offline, setOffline] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>) => {
    useApp.setState({ building: true, error: null });
    try { await fn(); } catch (e) { useApp.setState({ error: (e as Error).message }); }
    useApp.setState({ building: false });
  };

  const search = () => run(async () => setHits(await api.geocode(q)));
  const add = (p: LatLng) => { setWaypoints([...waypoints, { lat: p.lat, lng: p.lng }]); setHits([]); setQ(''); };
  const build = () => run(() => buildProgressive(waypoints, prefer, undefined, setRefining));
  const importUrl = () => run(async () => { setRoute(await api.importUrl(url, prefer)); setUrl(''); });
  const importFile = (f: File) => run(async () => setRoute(await api.importFile(await f.text(), prefer)));

  const start = async () => {
    await unlockAudio(); // user gesture: lets speech + chimes play later without taps
    useApp.setState({ navigating: true, follow: true, tab: 'ride' });
  };

  const gmaps = route ? googleMapsLinks(route) : null;
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setOffline(`${label} copied`); } catch { window.prompt('Copy this link', text); }
  };

  const saveOffline = async () => {
    if (!route) return;
    await prefetchTiles(route.geometry, (d, t) => setOffline(`Caching map ${d}/${t}`));
    setOffline('Map saved for offline use');
  };

  return (
    <div className="space-y-5">
      <Section title="Stops">
        <div className="flex gap-2">
          <Field placeholder="Search a place" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <Btn onClick={search} aria-label="Search"><Search /></Btn>
        </div>
        {hits.map((h) => (
          <Btn key={h.label} variant="ghost" className="w-full justify-start text-left text-base" onClick={() => add(h)}>
            <Plus className="shrink-0" /> <span className="line-clamp-2">{h.label}</span>
          </Btn>
        ))}
        <p className="text-neutral-400 text-sm">…or tap the map to drop a stop.</p>
        {waypoints.map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-10 h-10 rounded-full bg-apex text-black font-extrabold grid place-items-center">{i + 1}</span>
            <span className="flex-1 text-neutral-300">{w.lat.toFixed(4)}, {w.lng.toFixed(4)}</span>
            {i > 0 && (
              <Btn variant="ghost" aria-label="Move up" onClick={() => { const n = [...waypoints]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setWaypoints(n); }}><ArrowUp /></Btn>
            )}
            <Btn variant="ghost" aria-label="Remove" onClick={() => setWaypoints(waypoints.filter((_, j) => j !== i))}><Trash2 /></Btn>
          </div>
        ))}
      </Section>

      <Section title="Route style">
        <div className="flex gap-2">
          <Chip on={prefer === 'fastest'} onClick={() => useApp.setState({ prefer: 'fastest' })}>Fastest</Chip>
          <Chip on={prefer === 'curvy'} onClick={() => useApp.setState({ prefer: 'curvy' })}><Waves className="inline mr-1" size={18} />Curvy / scenic</Chip>
        </div>
        <Btn variant="primary" className="w-full" disabled={waypoints.length < 2 || building} onClick={build}>
          {building ? (refining ? 'Finding curvier roads…' : 'Building…') : `Build one continuous route (${waypoints.length} stops)`}
        </Btn>
      </Section>

      <Section title="Import">
        <div className="flex gap-2">
          <Field placeholder="Paste Google Maps link" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Btn onClick={importUrl} disabled={!url || building} aria-label="Import link"><Link2 /></Btn>
        </div>
        <input ref={file} type="file" accept=".gpx,.json,.geojson" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        <Btn variant="ghost" className="w-full" onClick={() => file.current?.click()}><FileUp /> Import GPX / GeoJSON</Btn>
      </Section>

      {error && <p className="text-warn font-semibold">{error}</p>}

      {route && (
        <Section title="Ready">
          <p className="text-xl font-bold">{route.name}</p>
          <p className="text-neutral-300">
            {fmtDist(route.distance)} · {fmtDuration(route.duration)} · curviness {route.curviness}/100 · {route.maneuvers.length} cues · no stops
          </p>
          <Btn variant="primary" className="w-full text-2xl min-h-[72px]" onClick={start}><Navigation /> Start riding</Btn>
          {gmaps && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <a href={gmaps.exact} target="_blank" rel="noopener noreferrer" className="flex-1 min-h-tap px-4 rounded-2xl border-2 border-edge bg-[#1c1c20] text-lg flex items-center justify-center gap-2 active:scale-[0.97]">
                  <ExternalLink /> Open in Google Maps
                </a>
                <Btn aria-label="Copy Google Maps link" onClick={() => copy(gmaps.exact, 'Google Maps link')}><Copy /></Btn>
              </div>
              <p className="text-neutral-400 text-sm">
                Follows this road using {gmaps.waypointCount} points along it. Google treats them as stops and may re-route between them.
                {gmaps.truncated && ' Some of your stops were dropped (Google allows 9).'}{' '}
                <button className="underline" onClick={() => copy(gmaps.stops, 'Stops-only link')}>Copy link with just my stops</button>
              </p>
            </div>
          )}
          <Btn variant="ghost" className="w-full" onClick={saveOffline}><Download /> {offline ?? 'Save map for offline'}</Btn>
        </Section>
      )}
    </div>
  );
}
