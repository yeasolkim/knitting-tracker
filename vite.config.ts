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
            // Cache pattern images and PDFs from R2 after first view
            // Uses CacheFirst so they're available offline without network
            // fetchOptions.mode = 'no-cors' required because R2 public bucket
            // does not serve CORS headers; without this the SW fetch fails.
            urlPattern: ({ url }) =>
              /\.(png|jpg|jpeg|webp|gif|pdf)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pattern-files-v1',
              fetchOptions: { mode: 'no-cors' },
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
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
