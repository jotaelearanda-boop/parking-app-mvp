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
      manifest: {
        name: 'Parking P2P', short_name: 'Parking', start_url: '/', display: 'standalone',
        background_color: '#ffffff', theme_color: '#2563eb',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000', '/ws': { target: 'ws://localhost:4000', ws: true } } },
});
