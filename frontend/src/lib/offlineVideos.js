const CACHE_NAME = 'tutoria-offline-videos-v1';
const SAVED_KEY = 'tutoria_saved_video_ids';

export function getSavedVideoIds() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
  catch { return []; }
}

export function isVideoSaved(videoId) {
  return getSavedVideoIds().includes(String(videoId));
}

function setSavedState(videoId, saved) {
  let ids = getSavedVideoIds();
  ids = saved
    ? ids.includes(String(videoId)) ? ids : [...ids, String(videoId)]
    : ids.filter(id => id !== String(videoId));
  localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
}

// Download + cache the video. onProgress(0-100 | null for indeterminate).
export async function saveVideoOffline(videoId, cloudflareVideoId, onProgress) {
  if (!cloudflareVideoId) {
    throw new Error('This video cannot be saved for offline viewing.');
  }
  if (!('caches' in window)) {
    throw new Error('Offline saving is not supported in this browser.');
  }

  const url = `https://videodelivery.net/${cloudflareVideoId}/downloads/default.mp4`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Download failed. Check your connection and try again.');
  }

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('This video is not available for offline download.');
    }
    throw new Error(`Download failed (HTTP ${response.status}).`);
  }

  const total = parseInt(response.headers.get('content-length') || '0', 10);
  let received = 0;
  const chunks = [];
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) {
      onProgress(total > 0 ? Math.round((received / total) * 100) : null);
    }
  }

  const blob = new Blob(chunks, { type: 'video/mp4' });
  const cached = new Response(blob, { headers: { 'Content-Type': 'video/mp4' } });

  const cache = await caches.open(CACHE_NAME);
  await cache.put(`/offline-video-${videoId}`, cached);
  setSavedState(videoId, true);
}

export async function removeVideoOffline(videoId) {
  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(`/offline-video-${videoId}`);
  }
  setSavedState(videoId, false);
}

// Returns an object-URL for the cached blob, or null if not cached.
// Caller is responsible for calling URL.revokeObjectURL() when done.
export async function getCachedVideoBlobUrl(videoId) {
  if (!('caches' in window)) return null;
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(`/offline-video-${videoId}`);
  if (!response) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// Size of a cached video in bytes, or null if not cached.
export async function getCachedVideoSize(videoId) {
  if (!('caches' in window)) return null;
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(`/offline-video-${videoId}`);
  if (!response) return null;
  const blob = await response.blob();
  return blob.size;
}

export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
