export const CHUNK_RELOAD_FLAG = 'cl_reloaded';

export const isChunkLoadError = (error) => (
  /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i
    .test(error?.message || String(error || ''))
);

export async function clearStaleAppCaches() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
    }
  } catch {
    // Best effort only. A reload is still useful if cache APIs are unavailable.
  }

  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => /workbox|precache|vite|udaya|tutoria/i.test(key))
          .map((key) => caches.delete(key))
      );
    }
  } catch {
    // Ignore cache API failures.
  }
}

export async function recoverFromChunkLoadError() {
  try { sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1'); } catch {}
  await clearStaleAppCaches();
  window.location.reload();
}
