# ApexRide

Mobile-first PWA for motorcycle riders: continuous multi-stop navigation, speed-aware audio cues, group tracking, route discovery.

```
npm install
npm run icons      # one-time placeholder icons -> public/
npm run dev        # Vite on :5173, API + Socket.io on :3001 (proxied)
npm test           # alert-schedule unit tests
npm run build && npm start   # production: API serves dist/
```
Copy `.env.example` to `.env` to change routing/geocoder/map providers (no keys needed by default). In dev, the Ride tab has a **Simulate ride at 65 mph** button so you can hear the cues from a desk.

## Hosting

**GitHub Pages (static, no server).** Pushing to `main` runs `.github/workflows/pages.yml`, which tests, builds and deploys to `https://<user>.github.io/<repo>/`. In this mode routing, place search, the road library, fair midpoint and GPX/GeoJSON import run in the browser against the free public services (OSRM, Nominatim/Photon, OpenFreeMap).

**What needs the server:** group rides, share links and Google Maps link import (they need shared state and server-side redirect following). To enable them, deploy the Node server (`render.yaml` is a ready blueprint for Render's free tier, or any host with websockets: Fly.io, Railway), then set the repo **variable** `API_URL` (Settings > Secrets and variables > Actions > Variables) to its URL and re-run the workflow. Set `CORS_ORIGIN` on the server to your Pages origin.

## Layout

```
shared/          Code used by client AND server
  types.ts         RouteData, Maneuver, Rider, LibraryEntry
  geo.ts           haversine, snapToRoute, curvinessIndex, maneuversFromGeometry
  osrm.ts          stitchOsrm(): N legs -> ONE route, intermediate arrive/depart dropped
server/
  index.ts         Express + Socket.io bootstrap (also serves dist/)
  routes/          route.ts (/route, /import) · library.ts · share.ts · places.ts (/geocode, /midpoint)
  services/        routing (OSRM, per-leg curvy selection) · importers (Google URL/GPX/GeoJSON)
                   midpoint (fair-ETA search) · geocode · library
  sources/         RouteSource interface + GPX-folder source for community packs
  sockets.ts       group rooms: join / loc / rider / left
src/
  audio/           alertSchedule.ts (pure scheduler) · engine.ts (TTS, chime, silent keep-alive)
                   phrasing.ts · status.ts (voice-query intents + answers)
  hooks/           usePosition (GPS or simulator) · useRouteProgress (snap, next maneuver, off-route)
                   useAudioNav · useVoiceQuery · useIntercomButton · useGroupSession
                   useLeafletMap (+ tile prefetch) · useWakeLock
  components/      MapView · PlanPanel · RideHUD · GroupPanel · DiscoverPanel · ui
  store.ts         zustand; route persisted to IndexedDB for offline starts
tests/             alertSchedule.test.ts
```

## How the key requirements work

- **No waypoint pauses** - the server requests routes from OSRM, then `stitchOsrm` concatenates geometry and discards every intermediate `arrive`/`depart` step. The client tracks only *distance along one polyline*, so waypoints are never "reached". Imports: Google Maps links (long, `maps.app.goo.gl`, `?api=1`; host-allowlisted), GPX (track/route/waypoints), GeoJSON. Tracks are road-snapped by default; `keepTrack: true` rides the file exactly.
- **Curvy routing** - `prefer: "curvy"` fetches OSRM alternatives *per leg* and picks the highest `curvinessIndex` within 2x of the fastest time.
- **Audio schedule** (`alertSchedule.ts`) - 0.75 / 0.5 / 0.25 mi, then a final warning at `max(0.1 mi, 8 s of travel)`; at >= 56 mph an extra 1 mi heads-up and terser phrasing; speech rate scales 0.95-1.35x with speed. On a leg with > 1.2 mi remaining, a two-tone chime + "Continue on X for another N miles" every 10 miles.
- **Intercom queries** - SpeechRecognition (opt-in mic toggle) answers "next turn / how far / what road / ETA / repeat / mute". Intercom media buttons arrive as Media Session actions (play/pause -> next turn, next -> distance, previous -> repeat).
- **Group** - 6-char codes (no look-alike characters), `?join=CODE` links, live markers at 1 Hz, fair midpoint via OSRM table API (coarse + fine grid, minimises ETA spread).
- **Offline** - service worker precaches the app shell, caches tiles (CacheFirst) and library; the route + maneuvers live in IndexedDB; TTS is on-device. "Save map for offline" prefetches a corridor of tiles.

## Known limits (be aware before shipping)

- **Siri**: a PWA can't register Siri intents. The workable path is a user-made Shortcut that opens `https://your.app/?cmd=next-turn` (also exposed as manifest shortcuts). True hands-free Siri needs a native wrapper.
- **Background audio**: iOS may suspend a PWA when the screen locks or another app takes focus. The silent-audio keep-alive and wake lock help but aren't guaranteed; a Capacitor wrapper with background location/audio entitlements is the robust option.
- **Mic + Bluetooth intercoms**: opening the mic can force the headset into a low-quality call profile. That's why voice commands are opt-in; the media-button path avoids it.
- **Basemap**: OpenFreeMap vector tiles (free, no key, commercial use allowed, attribution shown on the map). Drawn directly by MapLibre GL (full-colour "liberty" style: roads, buildings, water, parks). For heavy production traffic, consider self-hosting OpenFreeMap (their docs cover it) and point `VITE_MAP_STYLE` / `VITE_TILEJSON_URL` at it.
- **Routing**: the OSRM public demo is dev-only, car profile (no motorcycle profile), and has no "avoid highways". Self-host OSRM/Valhalla (Valhalla has a motorcycle costing and `use_trails`/curvy-adjacent options) for production.
- **Curviness** is computed from geometry (heading change per km); the seed library values are estimates, and library ratings for community uploads start at 0 - there is no rating/review submission yet.
- **Community aggregation**: only a licensed-GPX-folder source is implemented. Scraping forums wholesale generally violates their terms; add a `RouteSource` for feeds you have rights to.
- Group state and shared routes are in-memory (7-day TTL) - use Redis/Supabase for multi-instance deploys. No auth or rate limiting yet.
