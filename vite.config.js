import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon-192.png', 'icon-512.png'],
    manifest: {
      name: 'NutriChrono', short_name: 'NutriChrono', description: 'Food diary and chronometer',
      theme_color: '#080b16', background_color: '#080b16', display: 'standalone',
      orientation: 'portrait', start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webp}'] }
  })],
  server: { proxy: { '/api': 'http://localhost:8787' } }
});
