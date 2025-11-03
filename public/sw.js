// Service Worker for Trading Dashboard PWA
// Uses Push API for autonomous position checking - works on mobile and desktop
// Version: 1.2.0 - Fixed POST request handling

const CACHE_NAME = 'trading-dashboard-v1';
const API_ENDPOINT = '/api/positions';
const SW_VERSION = '1.2.0';

// Cache essential assets
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
			console.log('[Service Worker] Caching assets');
			return cache.addAll(ASSETS_TO_CACHE);
		})
	);
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('[Service Worker] Activating...');
	
	event.waitUntil(
		caches.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames.map((cacheName) => {
						if (cacheName !== CACHE_NAME) {
							console.log('[Service Worker] Deleting old cache:', cacheName);
							return caches.delete(cacheName);
						}
					})
				);
			})
			.then(() => {
				console.log('[Service Worker] ✅ Service Worker activated and cache cleaned');
			})
			.catch((error) => {
				console.error('[Service Worker] ❌ Error during activation:', error);
			})
	);
	
	return self.clients.claim();
});

console.log('[SW] ✅ Ready - Push API enabled for autonomous position checking');
console.log('[SW] Version:', SW_VERSION);

// Fetch event - network first for API, cache for static assets
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	
	// Skip unsupported schemes (chrome-extension, etc.)
	if (!event.request.url.startsWith('http')) {
		return;
	}
	
	// For API requests or non-GET requests, pass through without caching
	if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
		event.respondWith(fetch(event.request));
		return;
	}

	// For static assets, use cache-first strategy
	event.respondWith(
		fetch(event.request)
			.then((response) => {
				// Only cache successful GET responses for non-API requests
				if (response && response.status === 200) {
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseToCache).catch((err) => {
							// Silently ignore cache errors
							console.debug('[Service Worker] Cache put failed:', err.message);
						});
					});
				}
				return response;
			})
			.catch(() => {
				return caches.match(event.request);
			})
	);
});

// Store previous positions in IndexedDB
let previousPositions = [];

// Initialize IndexedDB
function initDB() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('TradingDashboardDB', 1);
		
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		
		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains('positions')) {
				db.createObjectStore('positions', { keyPath: 'id' });
			}
		};
	});
}

// Get stored positions from IndexedDB
async function getStoredPositions() {
	try {
		const db = await initDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(['positions'], 'readonly');
			const store = transaction.objectStore('positions');
			const request = store.get('current');
			
			request.onsuccess = () => resolve(request.result?.data || []);
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error('[Service Worker] Error getting stored positions:', error);
		return [];
	}
}

// Store positions in IndexedDB
async function storePositions(positions) {
	try {
		const db = await initDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(['positions'], 'readwrite');
			const store = transaction.objectStore('positions');
			const request = store.put({ id: 'current', data: positions, timestamp: Date.now() });
			
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error('[Service Worker] Error storing positions:', error);
	}
}

// Fetch current positions from Alpaca API via our backend
async function fetchPositions() {
	try {
		const apiResponse = await fetch(`${API_ENDPOINT}?t=${Date.now()}`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' },
			cache: 'no-store',
		});

		if (!apiResponse.ok) {
			console.error('[SW] Failed to fetch positions:', apiResponse.status);
			return null;
		}

		const positions = await apiResponse.json();
		console.log('[SW] ✅ Fetched', positions.length, 'positions');
		return positions;
	} catch (error) {
		console.error('[SW] Error fetching:', error.message);
		return null;
	}
}

// Compare positions and detect changes
function comparePositions(oldPositions, newPositions) {
	const changes = {
		opened: [],
		closed: [],
	};

	const oldSymbols = new Set(oldPositions.map(p => p.symbol));
	const newSymbols = new Set(newPositions.map(p => p.symbol));

	// Find newly opened positions
	newPositions.forEach(position => {
		if (!oldSymbols.has(position.symbol)) {
			changes.opened.push(position);
		}
	});

	// Find closed positions
	oldPositions.forEach(position => {
		if (!newSymbols.has(position.symbol)) {
			changes.closed.push(position);
		}
	});

	return changes;
}

// Send push notification with detailed trade information
async function sendNotification(type, position) {
	try {
		if (!self.registration) return;
		
		const ticker = getUnderlyingTicker(position.symbol);
		const qty = Math.abs(parseFloat(position.qty));
		
		let title, body;
		
		if (type === 'opened') {
			const price = parseFloat(position.avg_entry_price);
			const costBasis = Math.abs(parseFloat(position.cost_basis));
			title = `📈 ${ticker} Position Opened`;
			body = `${qty} shares @ $${price.toFixed(2)} (Cost: $${costBasis.toFixed(2)})`;
		} else {
			const pl = parseFloat(position.unrealized_pl || 0);
			const plPct = (parseFloat(position.unrealized_plpc || 0) * 100).toFixed(2);
			title = `📊 ${ticker} Position Closed`;
			body = `${qty} shares - ${pl >= 0 ? 'Profit' : 'Loss'}: $${Math.abs(pl).toFixed(2)} (${pl >= 0 ? '+' : ''}${plPct}%)`;
		}
		
		await self.registration.showNotification(title, {
			body,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			tag: `${type}-${position.symbol}`,
			data: { type, symbol: position.symbol, ticker, url: '/dashboard' },
		});
		
		console.log('[SW] ✅ Notification sent:', title);
	} catch (error) {
		console.error('[SW] Notification failed:', error.message);
	}
}

// Extract underlying ticker from option symbols
function getUnderlyingTicker(symbol) {
	const optionMatch = symbol.match(/^([A-Z]+)\d{6}[CP]/);
	return optionMatch ? optionMatch[1] : symbol;
}

// Check for position changes
async function checkPositionChanges() {
	console.log('[SW] Checking positions...');
	
	// Notify clients sync started
	const clients = await self.clients.matchAll();
	clients.forEach(client => {
		client.postMessage({ type: 'SYNC_STARTED', timestamp: Date.now() });
	});
	
	const currentPositions = await fetchPositions();
	if (!currentPositions) {
		clients.forEach(client => {
			client.postMessage({ type: 'SYNC_FAILED', timestamp: Date.now() });
		});
		return;
	}

	const storedPositions = await getStoredPositions();
	
	// First check - just store without notifications
	if (storedPositions.length === 0) {
		console.log('[SW] First check - storing', currentPositions.length, 'positions');
		await storePositions(currentPositions);
		clients.forEach(client => {
			client.postMessage({ type: 'SYNC_COMPLETED', hasChanges: false, timestamp: Date.now() });
		});
		return;
	}
	
	const changes = comparePositions(storedPositions, currentPositions);
	const hasChanges = changes.opened.length > 0 || changes.closed.length > 0;

	if (hasChanges) {
		console.log('[SW] 📊 Changes:', changes.opened.length, 'opened,', changes.closed.length, 'closed');
		
		// Send notifications
		for (const position of changes.opened) {
			await sendNotification('opened', position);
		}
		for (const position of changes.closed) {
			await sendNotification('closed', position);
		}
	}

	// Store current positions
	await storePositions(currentPositions);
	
	// Notify clients
	clients.forEach(client => {
		client.postMessage({ type: 'SYNC_COMPLETED', hasChanges, timestamp: Date.now() });
	});
	
	console.log('[SW] ✅ Check complete');
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	console.log('[Service Worker] Notification clicked:', event.notification.data);
	event.notification.close();

	const urlToOpen = event.notification.data?.url || '/dashboard';

	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// If dashboard is already open, focus it
			for (const client of clientList) {
				if (client.url.includes('dashboard') && 'focus' in client) {
					console.log('[Service Worker] Focusing existing dashboard window');
					return client.focus();
				}
			}
			// Otherwise, open a new window
			if (clients.openWindow) {
				console.log('[Service Worker] Opening new dashboard window');
				return clients.openWindow(urlToOpen);
			}
		})
	);
});

// Handle push events - server sends empty push to trigger position check
self.addEventListener('push', (event) => {
	console.log('[SW] 🔔 Push notification received');
	
	// Check if there's a payload (e.g., from test notification)
	let payload = null;
	if (event.data) {
		try {
			payload = event.data.json();
			console.log('[SW] Push payload:', payload);
		} catch (e) {
			console.log('[SW] No JSON payload, treating as position check trigger');
		}
	}
	
	// If payload has notification data (from test), show it directly
	if (payload && payload.title) {
		console.log('[SW] 🧪 Test notification received');
		event.waitUntil(
			self.registration.showNotification(payload.title, {
				body: payload.body,
				icon: payload.icon || '/icon-192.png',
				badge: payload.badge || '/icon-192.png',
				tag: 'test-notification',
				data: { type: 'test', url: '/dashboard' },
			})
		);
	} else {
		// Empty payload = regular position check
		console.log('[SW] Position check trigger');
		event.waitUntil(checkPositionChanges());
	}
});

// Message handler for communication with clients
self.addEventListener('message', (event) => {
	if (event.data.type === 'CHECK_NOW') {
		console.log('[SW] Manual check requested');
		event.waitUntil(checkPositionChanges());
	}
	
	if (event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
