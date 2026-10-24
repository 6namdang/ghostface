// Service Worker for FaceHelper PWA
// Bump the version whenever cached files change so clients pick up updates.
const CACHE_NAME = 'facehelper-cache-v5';

// Only same-origin files are precached. cache.addAll() fails as a whole if any
// one URL fails, so a CDN hiccup must not stop the worker from installing.
// Face-api and its models are cached on first use by the fetch handler below.
const APP_SHELL = [
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
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('Cache install error:', error);
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin === self.location.origin) {
        event.respondWith(networkFirst(event.request));
    } else {
        event.respondWith(cacheFirst(event.request));
    }
});

// Fetch app files first so online users receive UI fixes immediately. If the
// network is unavailable, fall back to the last cached version.
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return cache.match('/index.html');
        return Response.error();
    }
}

// CDN assets and model weights are immutable because their URLs include a
// package version. Cache them after first use for faster repeat loads.
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return Response.error();
    }
}
