import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { Capacitor } from '@capacitor/core'
import App from './App'
import './index.css'

// Mark whether we're running inside the native app, so the API layer can tag
// requests (used to enforce app-only viewing of protected files for students).
window.__UDAYA_NATIVE__ = Capacitor.isNativePlatform()

// Service worker policy by platform.
// • Native (Capacitor WebView): NEVER run a SW. The app already bundles its assets;
//   a SW only persists a precached index.html that, after an app update, points at
//   old chunk hashes missing from the new APK → every chunk 404s → blank white
//   screen ("installs but won't open"). So we actively tear down any SW + caches a
//   previous build may have left behind.
// • Web/PWA: register normally so the site stays installable + offline-capable.
if (Capacitor.isNativePlatform()) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {})
  }
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {})
  }
} else if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {})
}

// Error monitoring — dormant unless VITE_SENTRY_DSN is set in the Pages env.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}

// NOTE: React.StrictMode is intentionally OFF.
// In development it double-invokes mount (mount → unmount → mount), which makes
// every Framer Motion entrance animation (`initial="hidden"` / `fadeUp` /
// staggerChildren) play, tear down, and play AGAIN — read by users as cards
// "flickering" on load/navigation across every page. Production builds never
// double-mount, so this only ever affected the dev experience.
// Re-enable by wrapping <App /> in <React.StrictMode> if you want the extra
// dev-time checks back (impure-render / missing-cleanup detection).
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />,
)
