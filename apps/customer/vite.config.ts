import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Halokonobar Order',
        short_name: 'Order',
        description: 'Order drinks from your table',
        theme_color: '#0f0f0f',
        background_color: '#0f0f0f',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Cache menu responses for offline / slow network use
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/clubs\/.*\/menu/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'menu-cache',
              expiration: { maxAgeSeconds: 600, maxEntries: 10 },
            },
          },
          {
            urlPattern: /\.(png|jpg|jpeg|webp|svg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxAgeSeconds: 86400, maxEntries: 100 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env['VITE_API_URL'] ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
});
