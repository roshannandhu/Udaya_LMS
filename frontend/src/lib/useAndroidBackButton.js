import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

// Root tabs where Back should not leave the app silently — instead it offers to
// exit ("press back again"). Everywhere else, Back walks the SPA history.
const ROOT_PATHS = new Set(['/teacher', '/teacher/', '/student', '/student/']);

let lastBackPress = 0;

// Minimal, dependency-free toast (avoids pulling in @capacitor/toast).
function showExitToast(message) {
  const existing = document.getElementById('udaya-back-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'udaya-back-toast';
  el.textContent = message;
  el.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(96px + env(safe-area-inset-bottom))',
    'transform:translateX(-50%)', 'z-index:99999',
    'background:rgba(26,26,26,0.92)', 'color:#fff',
    'padding:10px 18px', 'border-radius:9999px',
    'font:600 13px/1 Inter,sans-serif', 'white-space:nowrap',
    'box-shadow:0 6px 20px rgba(0,0,0,0.25)', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); }, 2000);
}

// Wire Android's hardware Back button into the SPA (Capacitor APK):
//   - not on a root tab + history available → go back (React Router / BrowserRouter)
//   - on a root tab (or nothing to go back to) → "press back again to exit",
//     a second press within 2s exits the app.
// No-op on web and iOS — only registers on the Android native platform, and the
// @capacitor/app import is dynamic so it never loads off-Android.
export default function useAndroidBackButton() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    let remove = () => {};
    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        // If a video (or anything) is in fullscreen, Back must EXIT fullscreen and
        // stay on the page — NOT navigate. Capacitor's backButton listener overrides
        // the WebView's native "exit fullscreen on Back", so without this the player
        // collapsed AND the SPA navigated to the previous page on a single press.
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl) {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          return;
        }

        // If the soft keyboard is open (a field is focused), the first Back press
        // should just dismiss it and stay on the page — like every Android app.
        // Blurring the active element hides the WebView keyboard. Without this,
        // pressing Back while typing a comment navigated away mid-typing.
        const ae = document.activeElement;
        const isEditing = ae && (
          ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable
        );
        if (isEditing) {
          ae.blur();
          return;
        }

        const path = window.location.pathname;
        if (!ROOT_PATHS.has(path) && canGoBack) {
          window.history.back();
          return;
        }
        const now = Date.now();
        if (now - lastBackPress < 2000) {
          App.exitApp();
        } else {
          lastBackPress = now;
          showExitToast('Press back again to exit');
        }
      });
      if (cancelled) handle.remove();
      else remove = () => handle.remove();
    })();
    return () => { cancelled = true; remove(); };
  }, []);
}
