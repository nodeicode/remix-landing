// Service Worker for Trading Dashboard PWA
// Follows Apple's best practices for push notifications

const CACHE_NAME = 'trading-dashboard-v1';
const API_ENDPOINT = '/api/positions'; // Use our backend API proxy
const CHECK_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds

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

// Start position checks immediately when service worker loads
// This runs every time the service worker script is evaluated
let intervalId = null;

console.log('[Service Worker] Script loaded, starting position monitoring...');
console.log('[Service Worker] Starting position checks every', CHECK_INTERVAL / 1000, 'seconds');

// Clear any existing interval (in case of reload)
if (intervalId) {
	clearInterval(intervalId);
}

// Start checking positions via setInterval
intervalId = setInterval(() => {
	console.log('[Service Worker] 🔄 Periodic position check triggered');
	checkPositionChanges();
}, CHECK_INTERVAL);

console.log('[Service Worker] ✅ Position monitoring started - interval ID:', intervalId);

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
	// Skip caching for non-GET requests (HEAD, POST, etc.)
	if (event.request.method !== 'GET') {
		event.respondWith(fetch(event.request));
		return;
	}

	event.respondWith(
		fetch(event.request)
			.then((response) => {
				// Only cache successful GET responses
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
	console.log('[Service Worker] 🔔 sendNotification START:', { type, symbol: position.symbol });
	
	try {
		// First, verify we have a valid registration
		if (!self.registration) {
			console.error('[Service Worker] ❌ No registration available!');
			return;
		}
		
		console.log('[Service Worker] Registration valid:', {
			scope: self.registration.scope,
			active: !!self.registration.active,
		});
		
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
		
		const notificationOptions = {
			body,
			icon,
			badge,
			tag: `${type}-${position.symbol}-${Date.now()}`,
			requireInteraction: false,
			silent: false, // Make sure it's not silent
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
		};
		
		console.log('[Service Worker] 📤 About to call showNotification with:', { 
			title, 
			bodyPreview: body.substring(0, 50) + '...',
			tag: notificationOptions.tag,
		});
		
		const notificationPromise = self.registration.showNotification(title, notificationOptions);
		console.log('[Service Worker] showNotification called, waiting for promise...');
		
		await notificationPromise;
		
		console.log('[Service Worker] ✅ showNotification promise resolved! Notification should be visible now.');
	} catch (error) {
		console.error('[Service Worker] ❌ NOTIFICATION FAILED!');
		console.error('[Service Worker] Error type:', error.constructor.name);
		console.error('[Service Worker] Error message:', error.message);
		console.error('[Service Worker] Error stack:', error.stack);
		
		// Try to get more details about why it failed
		if (error.name === 'TypeError') {
			console.error('[Service Worker] TypeError - possibly invalid notification options');
		} else if (error.name === 'SecurityError') {
			console.error('[Service Worker] SecurityError - permission or origin issue');
		}
	}
	
	console.log('[Service Worker] 🔔 sendNotification END:', { type, symbol: position.symbol });
}

// Extract underlying ticker from option symbols
function getUnderlyingTicker(symbol) {
	const optionMatch = symbol.match(/^([A-Z]+)\d{6}[CP]/);
	return optionMatch ? optionMatch[1] : symbol;
}

// Check for position changes
async function checkPositionChanges() {
	const now = new Date().toLocaleTimeString();
	console.log(`[Service Worker] ${now} - Checking for position changes...`);
	
	// Notify clients that sync is starting
	let clients = await self.clients.matchAll();
	clients.forEach(client => {
		client.postMessage({
			type: 'SYNC_STARTED',
			timestamp: Date.now(),
		});
	});
	
	const currentPositions = await fetchPositions();
	if (!currentPositions) {
		console.log('[Service Worker] No positions fetched, skipping check');
		// Notify clients that sync failed
		clients.forEach(client => {
			client.postMessage({
				type: 'SYNC_FAILED',
				timestamp: Date.now(),
			});
		});
		return;
	}

	const storedPositions = await getStoredPositions();
	
	// If this is the first check, just store the positions without sending notifications
	if (storedPositions.length === 0) {
		console.log('[Service Worker] First check, storing initial positions');
		await storePositions(currentPositions);
		// Notify clients that sync completed
		clients.forEach(client => {
			client.postMessage({
				type: 'SYNC_COMPLETED',
				hasChanges: false,
				timestamp: Date.now(),
			});
		});
		return;
	}
	
	const changes = comparePositions(storedPositions, currentPositions);

	console.log('[Service Worker] Position changes detected:', {
		opened: changes.opened.length,
		closed: changes.closed.length,
		total: currentPositions.length,
		openedSymbols: changes.opened.map(p => p.symbol),
		closedSymbols: changes.closed.map(p => p.symbol),
	});

	// Check notification permission before sending
	if (changes.opened.length > 0 || changes.closed.length > 0) {
		console.log('[Service Worker] Changes detected! Preparing to send notifications...');
		console.log('[Service Worker] Number of notifications to send:', 
			changes.opened.length + changes.closed.length);
		
		// Get all clients to check notification permission from page context
		const clientList = await self.clients.matchAll();
		if (clientList.length > 0) {
			console.log('[Service Worker] Active clients found:', clientList.length);
		} else {
			console.warn('[Service Worker] No active clients found - notifications may not work!');
		}
	}

	// Send notifications for opened positions
	for (const position of changes.opened) {
		console.log('[Service Worker] 📢 Attempting to send OPENED notification for:', position.symbol);
		await sendNotification('opened', position);
	}

	// Send notifications for closed positions
	for (const position of changes.closed) {
		console.log('[Service Worker] 📢 Attempting to send CLOSED notification for:', position.symbol);
		await sendNotification('closed', position);
	}

	// Always store current positions after comparison
	// This ensures we have the latest state for next check
	await storePositions(currentPositions);
	
	// Send message to all clients to refresh data
	clients = await self.clients.matchAll();
	clients.forEach(client => {
		client.postMessage({
			type: 'SYNC_COMPLETED',
			hasChanges: changes.opened.length > 0 || changes.closed.length > 0,
			timestamp: Date.now(),
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

// Message handler for communication with clients
self.addEventListener('message', (event) => {
	console.log('[Service Worker] Message received:', event.data);
	
	if (event.data.type === 'CHECK_NOW') {
		console.log('[Service Worker] Manual position check requested');
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
