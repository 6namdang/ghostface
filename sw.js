// FaceHelper service worker
const APP_CACHE = 'facehelper-app-v7';
const MODEL_CACHE = 'facehelper-models-v1';
const MODEL_PREFIX = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/';

const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css?v=7',
    '/app.js?v=7',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        // Preserve model responses from older app caches before activation
        // retires them. Models use a stable cache across UI releases.
        await migrateLegacyModels();
        const cache = await caches.open(APP_CACHE);
        await cache.addAll(APP_SHELL);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames
            .filter((name) => name !== APP_CACHE && name !== MODEL_CACHE)
            .filter((name) => name.startsWith('facehelper-app-') || name.startsWith('facehelper-cache-'))
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        event.respondWith(request.mode === 'navigate'
            ? networkFirst(request)
            : staleWhileRevalidate(request));
        return;
    }

    if (request.url.startsWith(MODEL_PREFIX)) {
        event.respondWith(cacheFirst(request, MODEL_CACHE));
    }
});

async function migrateLegacyModels() {
    const target = await caches.open(MODEL_CACHE);
    const cacheNames = await caches.keys();

    for (const name of cacheNames) {
        if (name === MODEL_CACHE) continue;
        const source = await caches.open(name);
        const requests = await source.keys();
        for (const request of requests) {
            if (!request.url.startsWith(MODEL_PREFIX)) continue;
            const response = await source.match(request);
            if (response && !await target.match(request)) await target.put(request, response);
        }
    }
}

// Navigation stays network-first so online users receive the latest shell.
async function networkFirst(request) {
    const cache = await caches.open(APP_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        return await cache.match(request) || await cache.match('/index.html') || Response.error();
    }
}

// Static UI assets paint immediately from cache while refreshing in the
// background, avoiding a render-blocking network wait on repeat visits.
async function staleWhileRevalidate(request) {
    const cache = await caches.open(APP_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then(async (response) => {
            if (response.ok) await cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    return cached || await network || Response.error();
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        return Response.error();
    }
}
