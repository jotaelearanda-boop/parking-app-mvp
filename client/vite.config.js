import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { importScripts: ['push-sw.js'] },   // aviso push (public/push-sw.js)
      manifest: {
        name: 'APParK', short_name: 'APParK', start_url: '/', display: 'standalone',
        background_color: '#ffffff', theme_color: '#14213d',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000', '/ws': { target: 'ws://localhost:4000', ws: true } } },
});
