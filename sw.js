// Service Worker for FaceHelper PWA
// Bump the version whenever cached files change so clients pick up updates.
const CACHE_NAME = 'facehelper-cache-v3';
const FACE_API = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12';

// Only same-origin files are precached: cache.addAll() fails as a whole if any
// one URL fails, so a CDN hiccup must not stop the worker from installing.
// The face-api library and models (FACE_API, kept consistent with index.html
// and app.js) are cached by the fetch handler the first time they load.
const urlsToCache = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

// Cache-first. Same-origin files and the face-api CDN files (library and the
// ~7 MB of model weights) are cached on first use, so the app works offline
// after one successful online load.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const cacheable = url.origin === self.location.origin || request.url.startsWith(FACE_API);
    if (!cacheable) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request)
                .then((response) => {
                    // CDN responses are type 'cors', same-origin ones are 'basic'.
                    if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline and not cached: fall back to the app shell for page loads.
                    if (request.mode === 'navigate') return caches.match('/index.html');
                    return Response.error();
                });
        })
    );
});
