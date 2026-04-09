import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Workbox config
      workbox: {
        // Precache all generated JS/CSS/HTML assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache pattern images from R2 after first view (offline support).
            // fetchOptions.mode = 'no-cors': R2 public bucket returns opaque
            // responses for cross-origin requests. Opaque responses are fine
            // for <img> display (status 0 is cached). PDFs are excluded here
            // because react-pdf needs readable (non-opaque) response content —
            // an opaque cache hit causes ERR_FAILED on subsequent loads.
            urlPattern: ({ url }) =>
              /\.(png|jpg|jpeg|webp|gif)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pattern-images-v2',
              fetchOptions: { mode: 'no-cors' },
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // PDFs must always be fetched from the network.
            // Caching with no-cors produces an opaque response (status 0) which
            // react-pdf cannot read; serving it causes ERR_FAILED in the browser.
            urlPattern: ({ url }) => /\.pdf$/i.test(url.pathname),
            handler: 'NetworkOnly',
          },
        ],
        // Do not let the SW intercept admin routes (no offline needed there)
        navigationPreload: false,
        navigateFallbackDenylist: [/^\/admin/],
      },
      manifest: {
        name: 'Knitting in the Sauna',
        short_name: 'KIS',
        description: '뜨개질 도안 진행 트래커',
        theme_color: '#b07840',
        background_color: '#fdf6e8',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        // Icons: add 192x192 and 512x512 PNG files to /public to enable
        // home screen install prompt on mobile
      },
    }),
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
