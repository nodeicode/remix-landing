/// <reference no-default-lib="true"/>
/// <reference lib="webworker" />
/// <reference lib="es2020" />

// The WebWorker lib types `self` as WorkerGlobalScope. Cast it to the correct
// service worker scope so all SW-specific methods and events are properly typed.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = 'trading-dashboard-v2';
const SW_VERSION = '2.0.0';

const ASSETS_TO_CACHE = ['/', '/favicon.ico', '/manifest.json'];

// ── Install ──────────────────────────────────────────────────────────────────

sw.addEventListener('install', (event: ExtendableEvent) => {
	console.log('[SW] Installing v' + SW_VERSION);
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)),
	);
	sw.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────

sw.addEventListener('activate', (event: ExtendableEvent) => {
	console.log('[SW] Activating v' + SW_VERSION);
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) =>
				Promise.all(
					cacheNames
						.filter((name) => name !== CACHE_NAME)
						.map((name) => caches.delete(name)),
				),
			)
			.then(() => sw.clients.claim()),
	);
});

// ── Fetch (network-first, cache fallback for non-API GET) ────────────────────

sw.addEventListener('fetch', (event: FetchEvent) => {
	if (!event.request.url.startsWith('http')) return;

	const url = new URL(event.request.url);
	if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
		event.respondWith(fetch(event.request));
		return;
	}

	event.respondWith(
		fetch(event.request)
			.then((response) => {
				if (response.status === 200) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) =>
						cache.put(event.request, clone).catch(() => {}),
					);
				}
				return response;
			})
			.catch(() => caches.match(event.request) as Promise<Response>),
	);
});

// ── Push — server sends the full payload, we just display it ─────────────────
// The server (api.trigger-push) is the single authority on what changed.
// The SW never fetches positions independently.

interface PushPayload {
	title: string;
	body: string;
	icon?: string;
	badge?: string;
	tag?: string;
	timestamp?: number;
	data?: Record<string, unknown>;
}

sw.addEventListener('push', (event: PushEvent) => {
	console.log('[SW] 🔔 Push received');

	let payload: PushPayload | null = null;
	if (event.data) {
		try {
			payload = event.data.json() as PushPayload;
		} catch {
			console.warn('[SW] Push payload is not valid JSON');
		}
	}

	if (!payload?.title) {
		console.warn('[SW] Push received without title — ignoring');
		return;
	}

	const tag = payload.tag ?? 'trading-update';

	event.waitUntil(
		sw.registration.getNotifications().then((existing) => {
			// Close stale trading notifications so the new one always appears fresh
			existing
				.filter(
					(n) =>
						n.tag?.startsWith('fill-') ||
						n.tag === 'trading-update' ||
						n.tag === 'trading-summary',
				)
				.forEach((n) => n.close());
			return sw.registration.showNotification(payload!.title, {
				body: payload!.body,
				icon: payload!.icon ?? '/icon-192.png',
				badge: payload!.badge ?? '/icon-192.png',
				tag,
				data: payload!.data ?? { url: '/dashboard' },
				timestamp: payload!.timestamp ?? Date.now(),
				renotify: true,
			} as NotificationOptions);
		}),
	);
});

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

// ── Message ──────────────────────────────────────────────────────────────────

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
	const { type } = event.data as { type: string };
	if (type === 'SKIP_WAITING') {
		sw.skipWaiting();
	}
});

