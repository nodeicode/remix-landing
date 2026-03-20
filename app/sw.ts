/// <reference no-default-lib="true"/>
/// <reference lib="webworker" />
/// <reference lib="es2020" />

// The WebWorker lib types `self` as WorkerGlobalScope. Cast it to the correct
// service worker scope so all SW-specific methods and events are properly typed.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = 'trading-dashboard-v1';
const API_ENDPOINT = '/api/positions';
const SW_VERSION = '1.2.0';

const ASSETS_TO_CACHE = ['/', '/favicon.ico', '/manifest.json'];

// ── Types ────────────────────────────────────────────────────────────────────

interface AlpacaPosition {
	symbol: string;
	qty: string;
	avg_entry_price: string;
	cost_basis: string;
	unrealized_pl?: string;
	unrealized_plpc?: string;
}

interface PositionChanges {
	opened: AlpacaPosition[];
	closed: AlpacaPosition[];
}

interface StoredPositionsRecord {
	id: string;
	data: AlpacaPosition[];
	timestamp: number;
}

// ── Install ──────────────────────────────────────────────────────────────────

sw.addEventListener('install', (event: ExtendableEvent) => {
	console.log('[Service Worker] Installing...');
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log('[Service Worker] Caching assets');
			return cache.addAll(ASSETS_TO_CACHE);
		}),
	);
	sw.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────

sw.addEventListener('activate', (event: ExtendableEvent) => {
	console.log('[Service Worker] Activating...');
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) =>
				Promise.all(
					cacheNames.map((name) => {
						if (name !== CACHE_NAME) {
							console.log('[Service Worker] Deleting old cache:', name);
							return caches.delete(name);
						}
					}),
				),
			)
			.then(() => {
				console.log('[Service Worker] ✅ Activated and cache cleaned');
			})
			.catch((error: unknown) => {
				console.error('[Service Worker] ❌ Error during activation:', error);
			}),
	);
	sw.clients.claim();
});

console.log('[SW] ✅ Ready - Push API enabled for autonomous position checking');
console.log('[SW] Version:', SW_VERSION);

// ── Fetch ────────────────────────────────────────────────────────────────────

sw.addEventListener('fetch', (event: FetchEvent) => {
	const url = new URL(event.request.url);

	if (!event.request.url.startsWith('http')) return;

	if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
		event.respondWith(fetch(event.request));
		return;
	}

	event.respondWith(
		fetch(event.request)
			.then((response) => {
				if (response && response.status === 200) {
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseToCache).catch((err: unknown) => {
							console.debug('[Service Worker] Cache put failed:', (err as Error).message);
						});
					});
				}
				return response;
			})
			.catch(() => caches.match(event.request) as Promise<Response>),
	);
});

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function initDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('TradingDashboardDB', 1);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains('positions')) {
				db.createObjectStore('positions', { keyPath: 'id' });
			}
		};
	});
}

async function getStoredPositions(): Promise<AlpacaPosition[]> {
	try {
		const db = await initDB();
		return new Promise<AlpacaPosition[]>((resolve, reject) => {
			const transaction = db.transaction(['positions'], 'readonly');
			const store = transaction.objectStore('positions');
			const request = store.get('current');
			request.onsuccess = () =>
				resolve((request.result as StoredPositionsRecord | undefined)?.data ?? []);
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error('[Service Worker] Error getting stored positions:', error);
		return [];
	}
}

async function storePositions(positions: AlpacaPosition[]): Promise<void> {
	try {
		const db = await initDB();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(['positions'], 'readwrite');
			const store = transaction.objectStore('positions');
			const record: StoredPositionsRecord = {
				id: 'current',
				data: positions,
				timestamp: Date.now(),
			};
			const request = store.put(record);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error('[Service Worker] Error storing positions:', error);
	}
}

// ── Position polling ─────────────────────────────────────────────────────────

async function fetchPositions(): Promise<AlpacaPosition[] | null> {
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
		const positions: AlpacaPosition[] = await apiResponse.json();
		console.log('[SW] ✅ Fetched', positions.length, 'positions');
		return positions;
	} catch (error) {
		console.error('[SW] Error fetching:', (error as Error).message);
		return null;
	}
}

function comparePositions(
	oldPositions: AlpacaPosition[],
	newPositions: AlpacaPosition[],
): PositionChanges {
	const oldSymbols = new Set(oldPositions.map((p) => p.symbol));
	const newSymbols = new Set(newPositions.map((p) => p.symbol));
	return {
		opened: newPositions.filter((p) => !oldSymbols.has(p.symbol)),
		closed: oldPositions.filter((p) => !newSymbols.has(p.symbol)),
	};
}

function getUnderlyingTicker(symbol: string): string {
	const match = symbol.match(/^([A-Z]+)\d{6}[CP]/);
	return match ? match[1] : symbol;
}

async function sendNotification(type: 'opened' | 'closed', position: AlpacaPosition): Promise<void> {
	try {
		if (!sw.registration) return;
		const ticker = getUnderlyingTicker(position.symbol);
		const qty = Math.abs(parseFloat(position.qty));
		let title: string;
		let body: string;
		if (type === 'opened') {
			const price = parseFloat(position.avg_entry_price);
			const costBasis = Math.abs(parseFloat(position.cost_basis));
			title = `📈 ${ticker} Position Opened`;
			body = `${qty} shares @ $${price.toFixed(2)} (Cost: $${costBasis.toFixed(2)})`;
		} else {
			const pl = parseFloat(position.unrealized_pl ?? '0');
			const plPct = (parseFloat(position.unrealized_plpc ?? '0') * 100).toFixed(2);
			title = `📊 ${ticker} Position Closed`;
			body = `${qty} shares - ${pl >= 0 ? 'Profit' : 'Loss'}: $${Math.abs(pl).toFixed(2)} (${pl >= 0 ? '+' : ''}${plPct}%)`;
		}
		await sw.registration.showNotification(title, {
			body,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			tag: `${type}-${position.symbol}`,
			data: { type, symbol: position.symbol, ticker, url: '/dashboard' },
		});
		console.log('[SW] ✅ Notification sent:', title);
	} catch (error) {
		console.error('[SW] Notification failed:', (error as Error).message);
	}
}

async function checkPositionChanges(): Promise<void> {
	console.log('[SW] Checking positions...');
	const allClients = await sw.clients.matchAll();

	allClients.forEach((client) => client.postMessage({ type: 'SYNC_STARTED', timestamp: Date.now() }));

	const currentPositions = await fetchPositions();
	if (!currentPositions) {
		allClients.forEach((client) =>
			client.postMessage({ type: 'SYNC_FAILED', timestamp: Date.now() }),
		);
		return;
	}

	const storedPositions = await getStoredPositions();

	if (storedPositions.length === 0) {
		console.log('[SW] First check - storing', currentPositions.length, 'positions');
		await storePositions(currentPositions);
		allClients.forEach((client) =>
			client.postMessage({ type: 'SYNC_COMPLETED', hasChanges: false, timestamp: Date.now() }),
		);
		return;
	}

	const changes = comparePositions(storedPositions, currentPositions);
	const hasChanges = changes.opened.length > 0 || changes.closed.length > 0;

	if (hasChanges) {
		console.log('[SW] 📊 Changes:', changes.opened.length, 'opened,', changes.closed.length, 'closed');
		for (const position of changes.opened) await sendNotification('opened', position);
		for (const position of changes.closed) await sendNotification('closed', position);
	}

	await storePositions(currentPositions);
	allClients.forEach((client) =>
		client.postMessage({ type: 'SYNC_COMPLETED', hasChanges, timestamp: Date.now() }),
	);
	console.log('[SW] ✅ Check complete');
}

// ── Notification click ───────────────────────────────────────────────────────

sw.addEventListener('notificationclick', (event: NotificationEvent) => {
	event.notification.close();
	const urlToOpen: string = (event.notification.data as { url?: string })?.url ?? '/dashboard';
	event.waitUntil(
		sw.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clientList) => {
				for (const client of clientList) {
					if (client.url.includes('dashboard') && 'focus' in client) {
						return (client as WindowClient).focus();
					}
				}
				return sw.clients.openWindow(urlToOpen);
			}),
	);
});

// ── Push ─────────────────────────────────────────────────────────────────────

sw.addEventListener('push', (event: PushEvent) => {
	console.log('[SW] 🔔 Push notification received');
	let payload: { title?: string; body?: string; icon?: string; badge?: string } | null = null;
	if (event.data) {
		try {
			payload = event.data.json();
		} catch {
			console.log('[SW] No JSON payload, treating as position check trigger');
		}
	}
	if (payload?.title) {
		console.log('[SW] 🧪 Test notification received');
		event.waitUntil(
			sw.registration.showNotification(payload.title, {
				body: payload.body,
				icon: payload.icon ?? '/icon-192.png',
				badge: payload.badge ?? '/icon-192.png',
				tag: 'test-notification',
				data: { type: 'test', url: '/dashboard' },
			}),
		);
	} else {
		event.waitUntil(checkPositionChanges());
	}
});

// ── Message ──────────────────────────────────────────────────────────────────

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
	const { type } = event.data as { type: string };
	if (type === 'CHECK_NOW') {
		console.log('[SW] Manual check requested');
		event.waitUntil(checkPositionChanges());
	}
	if (type === 'SKIP_WAITING') {
		sw.skipWaiting();
	}
});
