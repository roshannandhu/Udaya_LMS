const CACHE_NAME = 'udaya-v1';
const OFFLINE_URL = '/offline.html';

const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // For video requests, use cache-first strategy
  if (request.destination === 'video' || url.pathname.includes('/videos/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // For API requests, network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => {
      return new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // For page requests, network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Message handler for video download management
self.addEventListener('message', (event) => {
  if (event.data.type === 'DOWNLOAD_VIDEO') {
    const { videoUrl, videoId } = event.data;
    downloadAndCacheVideo(videoUrl, videoId);
  }

  if (event.data.type === 'GET_CACHED_VIDEOS') {
    event.ports[0].postMessage({ cachedVideos: [] });
  }

  if (event.data.type === 'DELETE_VIDEO_CACHE') {
    const { videoId } = event.data;
    deleteVideoCache(videoId);
  }
});

async function downloadAndCacheVideo(videoUrl, videoId) {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error('Download failed');

    const blob = await response.blob();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(videoUrl, new Response(blob, {
      headers: { 'Content-Type': 'video/mp4' }
    }));

    // Store in IndexedDB for tracking
    const db = await openDB();
    const tx = db.transaction('videoCache', 'readwrite');
    const store = tx.objectStore('videoCache');
    await store.put({
      videoId,
      url: videoUrl,
      cachedAt: Date.now()
    });

    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'VIDEO_DOWNLOADED',
          videoId
        });
      });
    });
  } catch (error) {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'VIDEO_DOWNLOAD_ERROR',
          videoId,
          error: error.message
        });
      });
    });
  }
}

async function deleteVideoCache(videoId) {
  const db = await openDB();
  const tx = db.transaction('videoCache', 'readwrite');
  const store = tx.objectStore('videoCache');
  await store.delete(videoId);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('udaya-cache', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('videoCache')) {
        db.createObjectStore('videoCache', { keyPath: 'videoId' });
      }
    };
  });
}

// Background sync for offline submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-submissions') {
    event.waitUntil(syncOfflineSubmissions());
  }
});

async function syncOfflineSubmissions() {
  const db = await openDB();
  const tx = db.transaction('offlineSubmissions', 'readwrite');
  const store = tx.objectStore('offlineSubmissions');
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = async () => {
      const submissions = request.result;
      for (const submission of submissions) {
        try {
          const response = await fetch(submission.url, {
            method: submission.method,
            headers: submission.headers,
            body: JSON.stringify(submission.body)
          });
          if (response.ok) {
            store.delete(submission.id);
          }
        } catch (error) {
          console.error('Sync failed for:', submission.id);
        }
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}