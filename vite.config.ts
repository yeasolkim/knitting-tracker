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
        // Precache all generated JS/CSS/HTML assets (mjs = self-hosted pdf.js worker)
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        // The pdf.js worker is ~1MB+; raise the default 2MB ceiling so it is never skipped.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // pdf.js CMaps (CJK font maps) — same-origin static files, cache on first use.
            urlPattern: ({ url }) => url.pathname.startsWith('/cmaps/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-cmaps',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
            // PDFs must always be fetched from the network (for now).
            // Caching with no-cors produces an opaque response (status 0) which
            // react-pdf cannot read; serving it causes ERR_FAILED in the browser.
            // Once CORS is enabled on the R2 bucket (see docs/R2_CORS.md) the
            // responses become readable and this rule can be switched to CacheFirst.
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
        short_name: '니팅인더사우나',
        description: '뜨개질 도안 진행 트래커',
        lang: 'ko',
        theme_color: '#b07840',
        background_color: '#fdf6e8',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['lifestyle', 'productivity'],
        // PNGs live in /public (generated from favicon.svg). The maskable one has
        // ~20% safe padding on a cream background for Android adaptive icons.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
