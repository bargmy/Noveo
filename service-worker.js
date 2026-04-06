// service-worker.js
const CACHE_NAME = 'noveo-media-cache-v1';
const MEDIA_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mp3', '.ogg'];

// Check if URL is a media file
function isMediaUrl(url) {
    return MEDIA_EXTENSIONS.some(ext => url.toLowerCase().includes(ext));
}

// Install event - cache shell resources
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Fetch event - cache media files
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Only cache media files (images, videos, audio)
    if (!isMediaUrl(url)) {
        return; // Let browser handle non-media requests normally
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    // Return cached media immediately
                    return cachedResponse;
                }

                // Fetch from network and cache it
                return fetch(event.request).then(networkResponse => {
                    // Only cache successful responses
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(error => {
                    console.error('Fetch failed for:', url, error);
                    throw error;
                });
            });
        })
    );
});

// Message event - for manual cache clearing if needed
self.addEventListener('message', (event) => {
    if (event.data.action === 'clearCache') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                console.log('Service Worker: Cache cleared');
            })
        );
    }
});
