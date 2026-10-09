import { useEffect, useState, type RefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useApp } from '../store';

// OpenFreeMap: free vector tiles, no API key, no signup, commercial use allowed.
// "liberty" is the full-colour style (roads, buildings, water, parks, labels).
// Override in .env to use another style / TileJSON (self-hosted, MapTiler, ...).
export const MAP_STYLE = import.meta.env.VITE_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/liberty';
export const TILEJSON_URL = import.meta.env.VITE_TILEJSON_URL ?? 'https://tiles.openfreemap.org/planet';

/** Creates the MapLibre map once; returns it only after the style has loaded. */
export function useMap(ref: RefObject<HTMLDivElement>) {
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: ref.current,
        style: MAP_STYLE,
        center: [-98.35, 39.5],
        zoom: 3.2,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
    });
    } catch (e) {
      useApp.setState({ error: `Map could not start (WebGL unavailable?): ${(e as Error).message}` });
      return;
    }
    m.touchZoomRotate.disableRotation();
    // Attribution is required by the data licence; keep it visible above the bottom sheet.
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
    const ready = () => setMap(m);
    m.on('error', (e) => {
      console.error('[map]', e.error);
      if (!m.loaded()) useApp.setState({ error: `Map failed to load: ${e.error?.message ?? 'unknown error'}` });
    });
    m.once('load', ready);
    return () => {
      m.off('load', ready);
      m.remove();
      setMap(null);
    };
  }, [ref]);
  return map;
}

/** Warm the tile cache for a corridor around the route so it renders with no signal. */
export async function prefetchTiles(
  geometry: [number, number][],
  onProgress?: (done: number, total: number) => void,
  zooms = [8, 10, 12, 14],
  pad = 1,
) {
  // The tile URL embeds a data version, so read it from the TileJSON rather than hard-coding it.
  const tpl: string = (await (await fetch(TILEJSON_URL)).json()).tiles[0];
  const urls = new Set<string>();
  for (const z of zooms) {
    const n = 2 ** z;
    const step = Math.max(1, Math.floor(geometry.length / 800));
    for (let i = 0; i < geometry.length; i += step) {
      const [lng, lat] = geometry[i];
      const x = Math.floor(((lng + 180) / 360) * n);
      const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
      for (let dx = -pad; dx <= pad; dx++)
        for (let dy = -pad; dy <= pad; dy++)
          urls.add(tpl.replace('{z}', String(z)).replace('{x}', String(x + dx)).replace('{y}', String(y + dy)));
    }
  }
  const list = [...urls].slice(0, 3000);
  let done = 0;
  const queue = [...list];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        await fetch(queue.pop()!, { mode: 'cors' }).catch(() => {}); // the service worker caches each response
        onProgress?.(++done, list.length);
      }
    }),
  );
}
