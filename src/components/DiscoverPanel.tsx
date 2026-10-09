import { useEffect, useState } from 'react';
import { Star, Waves } from 'lucide-react';
import type { LibraryEntry } from '../../shared/types';
import { api } from '../lib/api';
import { buildProgressive } from '../lib/build';
import { useApp } from '../store';
import { Btn, Chip, Field } from './ui';

type Sort = 'rating' | 'length' | 'curviness';

export function DiscoverPanel() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('rating');
  const [twisty, setTwisty] = useState(false);
  const [top, setTop] = useState(false);
  const [rows, setRows] = useState<LibraryEntry[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const p: Record<string, string> = { sort };
      if (q) p.q = q;
      if (twisty) p.minCurviness = '70';
      if (top) p.minRating = '4.5';
      api.library(p).then((r) => { setRows(r); setErr(''); }).catch((e) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, sort, twisty, top]);

  const ride = async (e: LibraryEntry) => {
    useApp.setState({ building: true, error: null, tab: 'plan' });
    try {
      await buildProgressive(e.waypoints, 'curvy', e.name);
    } catch (x) { useApp.setState({ error: (x as Error).message }); }
    useApp.setState({ building: false });
  };

  return (
    <div className="space-y-4">
      <Field placeholder="City, region or road" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {(['rating', 'length', 'curviness'] as Sort[]).map((s) => <Chip key={s} on={sort === s} onClick={() => setSort(s)}>{s}</Chip>)}
        <Chip on={twisty} onClick={() => setTwisty(!twisty)}>Twisty 70+</Chip>
        <Chip on={top} onClick={() => setTop(!top)}>4.5★+</Chip>
      </div>
      {err && <p className="text-warn">{err} (offline? cached results show when available)</p>}
      {rows.map((r) => (
        <article key={r.id} className="rounded-2xl border-2 border-edge bg-[#101014] p-4 space-y-2">
          <h3 className="text-xl font-bold">{r.name}</h3>
          <p className="text-neutral-400">{[r.city, r.region, r.country].filter(Boolean).join(' · ')}</p>
          {r.description && <p className="text-neutral-300">{r.description}</p>}
          <div className="flex gap-4 text-lg">
            <span className="flex items-center gap-1 text-apex"><Star size={18} />{r.rating ? r.rating.toFixed(1) : '–'}</span>
            <span className="flex items-center gap-1"><Waves size={18} />{r.curviness}/100</span>
            <span>{Math.round(r.lengthKm * 0.621)} mi</span>
          </div>
          <Btn variant="primary" className="w-full" onClick={() => ride(r)}>Ride this road</Btn>
        </article>
      ))}
      {!rows.length && !err && <p className="text-neutral-400">No routes match.</p>}
    </div>
  );
}
