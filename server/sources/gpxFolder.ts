import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LibraryEntry } from '../../shared/types';
import { parseGpx, thinWaypoints } from '../services/importers';
import { curvinessIndex, cumulativeDistances } from '../../shared/geo';

/**
 * A pluggable community-route source. Implement `fetch()` for any licensed feed
 * (partner API, OSM extract, your own curated GPX pack) and register it in
 * server/routes/library.ts. Scraping forums wholesale usually violates their
 * terms - prefer sources that grant redistribution rights.
 */
export interface RouteSource {
  name: string;
  fetch(): Promise<LibraryEntry[]>;
}

/** Reads every .gpx in a folder (e.g. a curated pack you have rights to). */
export function gpxFolderSource(folder: string, meta: { region: string; country: string; city?: string }): RouteSource {
  return {
    name: `gpx:${folder}`,
    async fetch() {
      const files = (await fs.readdir(folder)).filter((f) => f.toLowerCase().endsWith('.gpx'));
      const out: LibraryEntry[] = [];
      for (const f of files) {
        const parsed = parseGpx(await fs.readFile(path.join(folder, f), 'utf8'));
        const coords =
          parsed.kind === 'track' ? parsed.coords : parsed.waypoints.map((p) => [p.lng, p.lat] as [number, number]);
        const cum = cumulativeDistances(coords);
        out.push({
          id: `gpx-${path.basename(f, '.gpx')}`,
          name: parsed.name,
          city: meta.city ?? '',
          region: meta.region,
          country: meta.country,
          lengthKm: Math.round(cum[cum.length - 1] / 100) / 10,
          rating: 0,
          curviness: curvinessIndex(coords, cum),
          tags: ['gpx'],
          source: `gpx:${path.basename(folder)}`,
          waypoints: thinWaypoints(coords, 20),
        });
      }
      return out;
    },
  };
}
