import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, PaddingOptions } from 'maplibre-gl';
import { Crosshair } from 'lucide-react';
import { useMap } from '../hooks/useMap';
import { useApp } from '../store';

/**
 * Space not covered by the control sheet, read from the real DOM so it is right on
 * every device: bottom sheet on phones, left side panel on tablets/desktop/landscape.
 */
function safePadding(): PaddingOptions {
  const sheet = document.getElementById('sheet');
  const base = { top: 70, bottom: 40, left: 40, right: 40 };
  if (!sheet) return base;
  const r = sheet.getBoundingClientRect();
  return r.width < window.innerWidth * 0.9
    ? { ...base, left: r.width + 40 } // side panel
    : { ...base, bottom: r.height + 30 }; // bottom sheet
}

function pin(n: number, last: boolean) {
  const el = document.createElement('div');
  el.textContent = String(n);
  el.style.cssText = `width:36px;height:36px;border-radius:50%;background:${last ? '#35e06b' : '#ffb400'};color:#000;font:800 17px system-ui;display:flex;align-items:center;justify-content:center;border:3px solid #000;box-shadow:0 2px 6px rgba(0,0,0,.5)`;
  return el;
}

/** Arrow + optional name label. The arrow rotates via CSS so the label stays upright. */
function arrow(color: string) {
  const root = document.createElement('div');
  root.style.cssText = 'position:relative;width:44px;height:44px';
  root.innerHTML = `<svg width="44" height="44" viewBox="0 0 44 44" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))"><path d="M22 3 L36 38 L22 31 L8 38 Z" fill="${color}" stroke="#000" stroke-width="3" stroke-linejoin="round"/></svg><span style="position:absolute;top:46px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#000;color:${color};font:700 12px system-ui;padding:1px 6px;border-radius:8px;display:none"></span>`;
  return root;
}
const setArrow = (el: HTMLElement, heading: number, label?: string) => {
  (el.firstElementChild as SVGElement).style.transform = `rotate(${heading}deg)`;
  const l = el.lastElementChild as HTMLElement;
  l.style.display = label ? 'block' : 'none';
  if (label) l.textContent = label;
};

/** Full-screen MapLibre map. One coordinate system for tiles, route and markers keeps everything aligned. */
export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const map = useMap(el);
  const { route, waypoints, fix, riders, navigating, follow, locating } = useApp();

  const pins = useRef<maplibregl.Marker[]>([]);
  const me = useRef<{ marker: maplibregl.Marker; el: HTMLElement }>();
  const others = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLElement }>());
  const located = useRef(false);

  // --- one-time layer + event setup ---
  useEffect(() => {
    if (!map) return;
    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // Keep place/road labels readable on top of the route.
    const beforeId = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 5, 14, 13], 'line-opacity': 0.85 } }, beforeId);
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff9f0a', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 14, 8] } }, beforeId);

    map.on('click', (e) => {
      const s = useApp.getState();
      if (s.tab === 'plan' && !s.navigating) s.setWaypoints([...s.waypoints, { lat: e.lngLat.lat, lng: e.lngLat.lng }]);
    });
    map.on('dragstart', () => useApp.setState({ follow: false }));
  }, [map]);

  // --- route line ---
  useEffect(() => {
    if (!map) return;
    const src = map.getSource('route') as GeoJSONSource | undefined;
    src?.setData(
      route
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.geometry } }
        : { type: 'FeatureCollection', features: [] },
    );
    if (route && !useApp.getState().navigating) {
      const b = new maplibregl.LngLatBounds();
      route.geometry.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: safePadding(), duration: 700, maxZoom: 15 });
    }
  }, [map, route]);

  // --- stop pins (and keep the camera on what the rider just added) ---
  useEffect(() => {
    if (!map) return;
    pins.current.forEach((m) => m.remove());
    pins.current = waypoints.map((w, i) =>
      new maplibregl.Marker({ element: pin(i + 1, i === waypoints.length - 1 && i > 0) }).setLngLat([w.lng, w.lat]).addTo(map),
    );
    const s = useApp.getState();
    if (s.navigating || s.route || !waypoints.length) return;
    if (waypoints.length === 1) {
      map.easeTo({ center: [waypoints[0].lng, waypoints[0].lat], zoom: Math.max(map.getZoom(), 11), padding: safePadding(), duration: 600 });
    } else {
      const b = new maplibregl.LngLatBounds();
      waypoints.forEach((w) => b.extend([w.lng, w.lat]));
      map.fitBounds(b, { padding: safePadding(), duration: 600, maxZoom: 14 });
    }
  }, [map, waypoints]);

  // --- my position + follow camera ---
  useEffect(() => {
    if (!map || !fix) return;
    if (!me.current) {
      const e = arrow('#2f8cff');
      me.current = { el: e, marker: new maplibregl.Marker({ element: e }).setLngLat([fix.lng, fix.lat]).addTo(map) };
    }
    me.current.marker.setLngLat([fix.lng, fix.lat]);
    setArrow(me.current.el, fix.heading);

    if (navigating && follow) {
      const zoom = fix.speed > 25 ? 14 : fix.speed > 12 ? 15 : 16; // zoom out as you go faster
      map.easeTo({ center: [fix.lng, fix.lat], zoom, padding: safePadding(), duration: 900, essential: true });
    } else if (locating && !located.current) {
      located.current = true;
      map.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.getZoom(), 13), padding: safePadding(), duration: 700 });
    }
  }, [map, fix, navigating, follow, locating]);

  // --- group riders ---
  useEffect(() => {
    if (!map) return;
    const live = new Set<string>();
    Object.values(riders).forEach((r) => {
      if (!Number.isFinite(r.lat)) return;
      live.add(r.id);
      let o = others.current.get(r.id);
      if (!o) {
        const e = arrow(r.color);
        o = { el: e, marker: new maplibregl.Marker({ element: e }).setLngLat([r.lng, r.lat]).addTo(map) };
        others.current.set(r.id, o);
      }
      o.marker.setLngLat([r.lng, r.lat]);
      setArrow(o.el, r.heading, r.name);
    });
    for (const [id, o] of others.current) if (!live.has(id)) { o.marker.remove(); others.current.delete(id); }
  }, [map, riders]);

  // Resize on viewport / orientation changes.
  useEffect(() => {
    if (!map || !el.current) return;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current);
    return () => ro.disconnect();
  }, [map]);

  return (
    <div className="absolute inset-0">
      {/* inline style: maplibre-gl.css sets .maplibregl-map{position:relative}, which would beat Tailwind classes and collapse the map to 0 height */}
      <div ref={el} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      <button
        aria-label="Show my location"
        onClick={() => { located.current = false; useApp.setState({ locating: true, follow: true }); }}
        className="absolute right-3 top-16 pt-safe z-10 w-14 h-14 rounded-2xl bg-black/85 border-2 border-edge grid place-items-center text-white active:scale-95"
      >
        <Crosshair />
      </button>
    </div>
  );
}
