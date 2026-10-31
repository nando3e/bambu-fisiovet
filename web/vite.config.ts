import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// En desarrollo, Vite pasa /api al API (PUERTO_API, por defecto 8105).
const PUERTO_API = globalThis.process?.env?.PUERTO_API ?? '8105';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // «prompt»: cuando hay versión nueva la app lo dice y se recarga al
      // pulsar, en vez de seguir sirviendo la vieja en silencio.
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-bambu.png'],
      manifest: {
        name: 'BAMBÚ Fisiovet',
        short_name: 'Bambú',
        description: 'Portal de derivacions de fisioteràpia veterinària',
        lang: 'ca-ES-valencia',
        start_url: '/acces',
        display: 'standalone',
        background_color: '#fffdf8',
        theme_color: '#344b3b',
        icons: [
          { src: '/icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icona-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // El API nunca se cachea: los datos son de verdad y cambian.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5205,
    proxy: { '/api': { target: `http://127.0.0.1:${PUERTO_API}`, changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
