// Service Worker for Trading Dashboard PWA
// Follows Apple's best practices for push notifications

const CACHE_NAME = 'trading-dashboard-v1';
const API_ENDPOINT = '/api/positions'; // Use our backend API proxy
const CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds

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
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((cacheName) => {
					if (cacheName !== CACHE_NAME) {
						console.log('[Service Worker] Deleting old cache:', cacheName);
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
	event.respondWith(
		fetch(event.request)
			.then((response) => {
				// Clone the response before caching
				const responseToCache = response.clone();
				caches.open(CACHE_NAME).then((cache) => {
					cache.put(event.request, responseToCache);
				});
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
		// Use our secure backend API endpoint instead of direct Alpaca API
		const apiResponse = await fetch(API_ENDPOINT, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!apiResponse.ok) {
			console.error('[Service Worker] Failed to fetch positions:', apiResponse.status);
			const errorData = await apiResponse.json().catch(() => ({}));
			console.error('[Service Worker] Error details:', errorData);
			return null;
		}

		const positions = await apiResponse.json();
		console.log('[Service Worker] Fetched positions:', positions.length);
		return positions;
	} catch (error) {
		console.error('[Service Worker] Error fetching positions:', error);
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
		const ticker = getUnderlyingTicker(position.symbol);
		const qty = Math.abs(parseFloat(position.qty));
		
		let title, body, icon, badge;
		
		if (type === 'opened') {
			const price = parseFloat(position.avg_entry_price);
			const costBasis = parseFloat(position.cost_basis);
			const side = position.side === 'long' ? 'Long' : 'Short';
			
			title = `📈 Position Opened: ${ticker}`;
			body = `${side} ${qty.toLocaleString()} shares @ $${price.toFixed(2)}\nCost Basis: $${Math.abs(costBasis).toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			})}`;
			icon = '/icon-192.png';
			badge = '/icon-192.png';
		} else if (type === 'closed') {
			const unrealizedPl = parseFloat(position.unrealized_pl || 0);
			const unrealizedPlPct = parseFloat(position.unrealized_plpc || 0) * 100;
			const isProfit = unrealizedPl >= 0;
			
			title = `📊 Position Closed: ${ticker}`;
			body = `${qty.toLocaleString()} shares\n${isProfit ? 'Profit' : 'Loss'}: $${Math.abs(unrealizedPl).toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			})} (${isProfit ? '+' : ''}${unrealizedPlPct.toFixed(2)}%)`;
			icon = '/icon-192.png';
			badge = '/icon-192.png';
		}
		
		await self.registration.showNotification(title, {
			body,
			icon,
			badge,
			tag: `${type}-${position.symbol}-${Date.now()}`,
			requireInteraction: false,
			vibrate: [200, 100, 200],
			data: {
				type,
				symbol: position.symbol,
				ticker,
				url: '/dashboard',
			},
			actions: [
				{
					action: 'view',
					title: '👁️ View Dashboard',
				},
			],
		});
		
		console.log('[Service Worker] Notification sent:', title);
	} catch (error) {
		console.error('[Service Worker] Error sending notification:', error);
	}
}

// Extract underlying ticker from option symbols
function getUnderlyingTicker(symbol) {
	const optionMatch = symbol.match(/^([A-Z]+)\d{6}[CP]/);
	return optionMatch ? optionMatch[1] : symbol;
}

// Check for position changes
async function checkPositionChanges() {
	console.log('[Service Worker] Checking for position changes...');
	
	const currentPositions = await fetchPositions();
	if (!currentPositions) {
		console.log('[Service Worker] No positions fetched, skipping check');
		return;
	}

	const storedPositions = await getStoredPositions();
	
	// If this is the first check, just store the positions without sending notifications
	if (storedPositions.length === 0) {
		console.log('[Service Worker] First check, storing initial positions');
		await storePositions(currentPositions);
		return;
	}
	
	const changes = comparePositions(storedPositions, currentPositions);

	console.log('[Service Worker] Position changes:', {
		opened: changes.opened.length,
		closed: changes.closed.length
	});

	// Send notifications for opened positions
	for (const position of changes.opened) {
		await sendNotification('opened', position);
	}

	// Send notifications for closed positions
	for (const position of changes.closed) {
		await sendNotification('closed', position);
	}

	// Store current positions for next comparison
	if (changes.opened.length > 0 || changes.closed.length > 0) {
		await storePositions(currentPositions);
	}
	
	// Send message to all clients to refresh data
	const clients = await self.clients.matchAll();
	clients.forEach(client => {
		client.postMessage({
			type: 'POSITIONS_UPDATED',
			hasChanges: changes.opened.length > 0 || changes.closed.length > 0,
		});
	});
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

// Handle push events (for when server sends push)
self.addEventListener('push', (event) => {
	console.log('[Service Worker] Push received');
	
	const data = event.data ? event.data.json() : {};
	const title = data.title || 'Trading Dashboard';
	const options = {
		body: data.body || 'New update available',
		icon: '/favicon.ico',
		badge: '/favicon.ico',
		data: data.data || {},
	};

	event.waitUntil(
		self.registration.showNotification(title, options)
	);
});

// Periodic background sync (when supported)
self.addEventListener('periodicsync', (event) => {
	if (event.tag === 'check-positions') {
		console.log('[Service Worker] Periodic sync triggered');
		event.waitUntil(checkPositionChanges());
	}
});

// Message handler for communication with clients
self.addEventListener('message', (event) => {
	console.log('[Service Worker] Message received:', event.data);
	
	if (event.data.type === 'CHECK_NOW') {
		event.waitUntil(checkPositionChanges());
	}
	
	if (event.data.type === 'TEST_NOTIFICATION') {
		// Send a test notification immediately
		event.waitUntil(
			sendTestNotification(event.data.testType || 'opened')
		);
	}
	
	if (event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

// Send a test notification for demonstration
async function sendTestNotification(type) {
	console.log('[Service Worker] Sending test notification:', type);
	
	// Create a mock position for testing
	const mockPosition = {
		symbol: 'AAPL',
		qty: '100',
		avg_entry_price: '150.00',
		cost_basis: '15000.00',
		market_value: '15500.00',
		unrealized_pl: '500.00',
		unrealized_plpc: '0.0333',
		current_price: '155.00',
		side: 'long'
	};
	
	try {
		await sendNotification(type, mockPosition);
		console.log('[Service Worker] Test notification sent successfully');
	} catch (error) {
		console.error('[Service Worker] Failed to send test notification:', error);
	}
}

// Start periodic check (fallback if periodic sync not supported)
let intervalId = null;

self.addEventListener('activate', (event) => {
	// Clear any existing interval
	if (intervalId) {
		clearInterval(intervalId);
	}
	
	// Start checking every 30 minutes
	intervalId = setInterval(() => {
		checkPositionChanges();
	}, CHECK_INTERVAL);
	
	// Do an immediate check
	checkPositionChanges();
});
