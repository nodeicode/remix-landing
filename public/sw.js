// Service Worker for Trading Dashboard PWA
// Version: 2.0.0 - Simplified for Server-Side Logic

const CACHE_NAME = 'trading-dashboard-v2';
const ASSETS_TO_CACHE = [
	'/',
	'/favicon.ico',
	'/manifest.json',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
	console.log('[Service Worker] Installing...');
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(ASSETS_TO_CACHE);
		})
	);
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('[Service Worker] Activating...');
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
	return self.clients.claim();
});

// Fetch event - network first for API, cache for static assets
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	
	if (!event.request.url.startsWith('http')) return;
	
	// API requests: Network only
	if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
		event.respondWith(fetch(event.request));
		return;
	}

	// Static assets: Cache first, then network
	event.respondWith(
		caches.match(event.request).then((response) => {
			return response || fetch(event.request).then((response) => {
				if (response && response.status === 200) {
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseToCache);
					});
				}
				return response;
			});
		})
	);
});

// Handle push events - Display notification from payload
self.addEventListener('push', (event) => {
	console.log('[SW] 🔔 Push received');
	
	let data = {};
	if (event.data) {
		try {
			data = event.data.json();
		} catch (e) {
			console.error('[SW] Failed to parse push data', e);
		}
	}

	const title = data.title || 'Trading Update';
	const options = {
		body: data.body || 'New activity detected',
		icon: '/icon-192.png',
		badge: '/icon-192.png',
		data: { url: '/' }
	};

	event.waitUntil(
		self.registration.showNotification(title, options)
	);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	console.log('[SW] Notification clicked');
	event.notification.close();

	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// Focus existing window if available
			for (const client of clientList) {
				if (client.url.includes(self.registration.scope) && 'focus' in client) {
					return client.focus();
				}
			}
			// Open new window
			if (clients.openWindow) {
				return clients.openWindow('/');
			}
		})
	);
});
