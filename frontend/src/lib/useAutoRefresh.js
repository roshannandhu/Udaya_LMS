import { useEffect, useRef } from 'react';
import { clearApiCache } from './api';

// Re-run `callback` whenever the app signals that server data may have changed:
//   • window 'focus'                    — user came back to the tab/app
//   • document 'visibilitychange'       — tab became visible again
//   • 'udaya:data-changed'              — the notification poll (notifications.js)
//                                          saw a NEW notification, i.e. a teacher/
//                                          student action happened somewhere
//
// This is the single subscription point that turns the existing 30s notification
// heartbeat (and Android foreground push) into live page refreshes, replacing the
// copy-pasted focus/visibility effects scattered across pages.
//
// A short debounce coalesces a focus+event burst into one refetch. The latest
// callback is always used (kept in a ref) so callers don't need a stable identity.
export function useAutoRefresh(callback, { debounceMs = 500, enabled = true } = {}) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;

    const run = () => {
      if (document.visibilityState === 'hidden') return; // don't refetch a hidden tab
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Drop the 120s in-memory GET cache so the page's existing load() refetches
        // live data — no need to thread a `fresh` flag through every api helper.
        try { clearApiCache(); } catch { /* ignore */ }
        try { cbRef.current?.(); } catch { /* ignore */ }
      }, debounceMs);
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') run(); };

    window.addEventListener('focus', run);
    window.addEventListener('udaya:data-changed', run);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', run);
      window.removeEventListener('udaya:data-changed', run);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, debounceMs]);
}

export default useAutoRefresh;
