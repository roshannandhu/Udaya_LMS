import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tutoria LMS',
        short_name: 'Tutoria',
        start_url: '/',
        display: 'standalone',
        background_color: '#FAFAF9',
        theme_color: '#1a1a1a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [{
          urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
          handler: 'CacheFirst',
          options: { cacheName: 'supabase-storage', expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 } }
        }]
      }
    })
  ],
  server: {
    port: 3001,
    strictPort: true
  }
})
