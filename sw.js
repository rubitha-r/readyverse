/**
 * ReadyVerse - Service Worker (Prompt 8)
 * Provides robust offline PWA caching for App Shell, Lessons, Drills, and Data.
 */

const CACHE_NAME = 'readyverse-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './css/readyverse-ai.css',
    './js/script.js',
    './js/progress.js',
    './js/speech.js',
    './js/data/sources.js',
    './js/data/tamil-translations.js',
    './js/readyverse-ai/ai-ui.js',
    './js/readyverse-ai/ai-transport.js',
    './js/readyverse-ai/ai-context.js',
    './js/readyverse-ai/ai-personality.js',
    './js/readyverse-ai/ai-tools.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/icon.svg',
    './assets/cinematic/shot1_calm.jpg',
    './assets/cinematic/shot2_smoke.jpg',
    './assets/cinematic/shot4_assembly.jpg',
    './assets/cinematic/cyclone_shelter.jpg',
    './assets/cinematic/flood_evac.jpg',
    './assets/cinematic/quake_shelter.jpg'
];

// Install Event: Pre-cache App Shell & Core Assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Attempt to cache static assets individually so one missing asset doesn't fail whole install
            const cachePromises = STATIC_ASSETS.map(async (url) => {
                try {
                    const response = await fetch(url, { cache: 'no-cache' });
                    if (response.ok) {
                        return cache.put(url, response);
                    }
                } catch (err) {
                    console.warn('[SW] Could not pre-cache asset:', url, err);
                }
            });
            await Promise.all(cachePromises);
            return self.skipWaiting();
        })
    );
});

// Activate Event: Clean up old caches & claim clients immediately
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
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Cache-First for static assets, Network-First with Offline JSON for /api/coach
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. Handle API Coach endpoint
    if (url.pathname.endsWith('/api/coach') || url.pathname.includes('/.netlify/functions/coach')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(
                    JSON.stringify({
                        success: true,
                        provider: 'offline-service-worker',
                        response: "I'm offline right now. Live AI coaching requires an active internet connection. Please check your offline ReadyVerse lessons or call 112 in a real emergency.",
                        isOffline: true
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 200
                    }
                );
            })
        );
        return;
    }

    // 2. Handle HTML Navigation requests (App Shell fallback)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match('./index.html');
                if (cached) return cached;
                return caches.match('./');
            })
        );
        return;
    }

    // 3. Static Assets: Cache-First with Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                // Fetch in background to update cache
                fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, networkResponse.clone());
                        });
                    }
                }).catch(() => {/* Ignore background fetch failure when offline */});
                return cachedResponse;
            }

            // Fallback to network
            return fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Return offline fallback if applicable
                if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
