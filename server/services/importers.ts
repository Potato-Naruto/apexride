import type { LatLng } from '../../shared/types';
import { geocode } from './geocode';

/** Hosts we are willing to fetch server-side (SSRF guard). */
const ALLOWED_HOSTS = [/(^|\.)google\.[a-z.]+$/i, /^maps\.app\.goo\.gl$/i, /^goo\.gl$/i, /^g\.co$/i];
const hostOk = (u: URL) => u.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(u.hostname));

async function expandShortLink(raw: string): Promise<URL> {
  let url = new URL(raw);
  for (let hop = 0; hop < 5; hop++) {
    if (!hostOk(url)) throw new Error('Only Google Maps links are supported');
    if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname.startsWith('/maps/dir')) return url;
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    const loc = res.headers.get('location');
    if (!loc) return url;
    url = new URL(loc, url);
  }
  throw new Error('Too many redirects');
}

const COORD = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

async function resolveStop(s: string): Promise<LatLng> {
  const m = COORD.exec(s);
  if (m) return { lat: +m[1], lng: +m[2] };
  const [hit] = await geocode(s, 1);
  if (!hit) throw new Error(`Could not locate "${s}"`);
  return { lat: hit.lat, lng: hit.lng };
}

/** Parse a Google Maps directions URL (long, short, or ?api=1 form) into ordered stops. */
export async function parseGoogleMapsUrl(raw: string): Promise<{ waypoints: LatLng[]; name: string }> {
  const url = await expandShortLink(raw);
  let stops: string[] = [];
  let dataCoords: LatLng[] = [];

  const dir = /\/maps\/dir\/(.+?)(?:\/@|\/data=|\?|$)/.exec(url.pathname + (url.href.includes('/data=') ? '' : ''));
  if (dir) {
    stops = dir[1].split('/').map(decodeURIComponent).map((s) => s.replace(/\+/g, ' ')).filter(Boolean);
    // Exact stop coordinates live in the data= blob as !1d<lng>!2d<lat>
    const data = /\/data=([^?]*)/.exec(url.href)?.[1] ?? '';
    for (const m of data.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)) dataCoords.push({ lat: +m[2], lng: +m[1] });
  } else if (url.searchParams.get('destination')) {
    const p = url.searchParams;
    stops = [p.get('origin'), ...(p.get('waypoints')?.split('|') ?? []), p.get('destination')].filter(Boolean) as string[];
  }
  if (stops.length < 2) throw new Error('No route found in that link');
  if (dataCoords.length !== stops.length) dataCoords = [];

  const waypoints = dataCoords.length ? dataCoords : await Promise.all(stops.map(resolveStop));
  return { waypoints, name: `${stops[0].split(',')[0]} → ${stops[stops.length - 1].split(',')[0]}` };
}

/* ---------- GPX / GeoJSON (regex based: no DOM on the server) ---------- */

const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`).exec(tag)?.[1];

function gpxPoints(xml: string, tag: 'trkpt' | 'rtept' | 'wpt'): LatLng[] {
  const out: LatLng[] = [];
  for (const m of xml.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))) {
    const lat = attr(m[0], 'lat');
    const lon = attr(m[0], 'lon');
    if (lat && lon) out.push({ lat: +lat, lng: +lon });
  }
  return out;
}

export type Imported =
  | { kind: 'waypoints'; waypoints: LatLng[]; name: string }
  | { kind: 'track'; coords: [number, number][]; name: string };

export function parseGpx(xml: string): Imported {
  const name = /<name>([^<]*)<\/name>/.exec(xml)?.[1]?.trim() || 'Imported GPX';
  const track = gpxPoints(xml, 'trkpt');
  if (track.length > 1) return { kind: 'track', coords: track.map((p) => [p.lng, p.lat]), name };
  const rte = gpxPoints(xml, 'rtept');
  if (rte.length > 1) return { kind: 'waypoints', waypoints: rte, name };
  const wpt = gpxPoints(xml, 'wpt');
  if (wpt.length > 1) return { kind: 'waypoints', waypoints: wpt, name };
  throw new Error('GPX contains no usable route');
}

export function parseGeoJson(gj: any): Imported {
  const feats: any[] = gj?.type === 'FeatureCollection' ? gj.features : gj?.type === 'Feature' ? [gj] : [{ geometry: gj }];
  const name = feats.find((f) => f?.properties?.name)?.properties.name ?? 'Imported route';
  const line = feats.map((f) => f?.geometry).find((g) => g?.type === 'LineString' || g?.type === 'MultiLineString');
  if (line) {
    const coords: [number, number][] = (line.type === 'LineString' ? line.coordinates : line.coordinates.flat()).map(
      (c: number[]) => [c[0], c[1]],
    );
    if (coords.length > 1) return { kind: 'track', coords, name };
  }
  const pts = feats.map((f) => f?.geometry).filter((g) => g?.type === 'Point').map((g) => ({ lat: g.coordinates[1], lng: g.coordinates[0] }));
  if (pts.length > 1) return { kind: 'waypoints', waypoints: pts, name };
  throw new Error('GeoJSON contains no usable route');
}

/** Thin a long track to <= max anchor points, always keeping the ends. */
export function thinWaypoints(coords: [number, number][], max = 20): LatLng[] {
  if (coords.length <= max) return coords.map(([lng, lat]) => ({ lat, lng }));
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) {
    const [lng, lat] = coords[Math.round((i * (coords.length - 1)) / (max - 1))];
    out.push({ lat, lng });
  }
  return out;
}
