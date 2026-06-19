// Offline cache for PROTECTED files (notes / assignment / broadcast documents).
// Mirrors offlineVideos.js: bytes are stored in the app's sandboxed Cache Storage
// — NOT the device Downloads folder — so there's still no extractable file, and
// the SecureFileViewer reads from here when offline. App-only by design (student
// protected-file viewing is already app-only).

import { fetchSecureBlob } from './api';

const CACHE_NAME = 'udaya-offline-files-v1';
const SAVED_KEY  = 'udaya_saved_file_keys';

function cacheUrl(key) { return `/offline-file-${key}`; }

export function getSavedFileKeys() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
  catch { return []; }
}

export function isFileSaved(key) {
  return getSavedFileKeys().includes(String(key));
}

function setSavedState(key, saved) {
  let keys = getSavedFileKeys();
  keys = saved
    ? (keys.includes(String(key)) ? keys : [...keys, String(key)])
    : keys.filter(k => k !== String(key));
  localStorage.setItem(SAVED_KEY, JSON.stringify(keys));
}

// Fetch the file via the authed endpoint and persist it in Cache Storage.
export async function saveFileOffline(endpoint, key) {
  if (!('caches' in window)) throw new Error('Offline saving is not supported here.');
  const { blob, type } = await fetchSecureBlob(endpoint);
  const cache = await caches.open(CACHE_NAME);
  // Keep the content-type so the viewer can classify it offline.
  await cache.put(cacheUrl(key), new Response(blob, { headers: { 'Content-Type': type || 'application/octet-stream' } }));
  setSavedState(key, true);
  return blob.size;
}

export async function removeFileOffline(key) {
  if ('caches' in window) {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(cacheUrl(key));
  }
  setSavedState(key, false);
}

// Returns { blob, type } from cache, or null if not cached.
export async function getCachedFile(key) {
  if (!('caches' in window)) return null;
  const cache = await caches.open(CACHE_NAME);
  const res = await cache.match(cacheUrl(key));
  if (!res) return null;
  const blob = await res.blob();
  return { blob, type: blob.type || res.headers.get('content-type') || 'application/octet-stream' };
}

export async function getCachedFileSize(key) {
  const hit = await getCachedFile(key);
  return hit ? hit.blob.size : null;
}

export function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
