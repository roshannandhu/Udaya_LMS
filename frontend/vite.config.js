import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Udaya LMS',
        short_name: 'Udaya',
        start_url: '/',
        display: 'standalone',
        background_color: '#FAFAF9',
        theme_color: '#1a1a1a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      includeAssets: ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Activate a new service worker immediately and drop old precaches so the
        // app never serves stale chunk references after a deploy (the cause of
        // "failed to load module" crashes on navigation/reload).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [{
          urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
          handler: 'CacheFirst',
          options: { cacheName: 'supabase-storage', expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 } }
        }]
      }
    })
  ],
  // Pre-bundle every heavy dependency that's only imported by lazy routes. Without
  // this, Vite discovers them on first navigation, re-runs its optimizer, and forces
  // a full-page reload — which presents as the page "freezing" the first time it opens.
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-router-dom', 'zustand',
      '@supabase/supabase-js', 'lucide-react',
      'recharts', 'jspdf', 'jspdf-autotable',
      'xlsx', 'mammoth', 'papaparse',
    ],
  },
  server: {
    port: 3001,
    strictPort: true,
    host: true
  }
})
