import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const API = 'http://localhost:3001';
// GitHub Pages serves project sites from /<repo>/; the workflow sets VITE_BASE.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ApexRide',
        short_name: 'ApexRide',
        description: 'Continuous motorcycle navigation with speed-aware audio cues and group tracking.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Next turn', url: `${base}?cmd=next-turn` },
          { name: 'Distance to turn', url: `${base}?cmd=distance` },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        runtimeCaching: [
          {
            // Style JSON, sprites and fonts for the basemap: needed to draw anything offline.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org' && !url.pathname.endsWith('.pbf'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'apex-map-assets', expiration: { maxEntries: 300 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Map tiles: cache-first so previously viewed / prefetched areas work offline.
            urlPattern: ({ url }) => /\/\d+\/\d+\/\d+(@2x)?\.(png|jpg|webp|pbf)/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'apex-tiles',
              expiration: { maxEntries: 6000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/library') || url.pathname.startsWith('/api/share/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'apex-api', expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
