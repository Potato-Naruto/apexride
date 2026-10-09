/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // Tablets, desktops and landscape phones: controls move to a left side panel.
        side: { raw: '(min-width: 700px), (orientation: landscape) and (max-height: 500px)' },
      },
      colors: {
        ink: '#000000',
        panel: '#0e0e10',
        edge: '#2a2a2e',
        apex: { DEFAULT: '#ffb400', dim: '#b37f00' },
        go: '#35e06b',
        warn: '#ff4d3d',
      },
      minHeight: { tap: '56px' },
      minWidth: { tap: '56px' },
    },
  },
  plugins: [],
};
