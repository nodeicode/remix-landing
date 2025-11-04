// Service Worker Communication Utility
// This script runs on the client side and communicates with the service worker

export function registerServiceWorker() {
	if (!('serviceWorker' in navigator)) {
		console.log('Service Worker not supported');
		return;
	}

	navigator.serviceWorker.register('/sw.js')
		.then((registration) => {
			console.log('Service Worker registered:', registration.scope);
			
			// Request notification permission on iOS
			if ('Notification' in window) {
				Notification.requestPermission().then((permission) => {
					console.log('Notification permission:', permission);
					
					if (permission === 'granted') {
						// Subscribe to push notifications
						subscribeToPushNotifications(registration);
					}
				});
			}

			// Check for updates every 15 minutes
			setInterval(() => {
				registration.update();
			}, 15 * 60 * 1000);
		})
		.catch((error) => {
			console.error('Service Worker registration failed:', error);
		});

	// Listen for messages from service worker
	navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
}

async function subscribeToPushNotifications(registration: ServiceWorkerRegistration) {
	try {
		// Check if already subscribed
		const existingSubscription = await registration.pushManager.getSubscription();
		if (existingSubscription) {
			console.log('Already subscribed to push notifications');
			return;
		}

		// For iOS and other platforms, we'll use notification API directly
		// since push subscriptions require a VAPID key and backend setup
		console.log('Push notifications ready');
	} catch (error) {
		console.error('Failed to subscribe to push notifications:', error);
	}
}

function handleServiceWorkerMessage(event: MessageEvent) {
	const { type, data } = event.data;

	switch (type) {
		case 'POSITIONS_UPDATED':
			if (data?.hasChanges) {
				console.log('Positions updated, reloading...');
				// Optionally reload or update UI
				window.dispatchEvent(new CustomEvent('positions-updated'));
			}
			break;

		case 'NOTIFICATION':
			// Handle notification if needed
			console.log('Notification received:', data);
			break;

		default:
			console.log('Unknown message type:', type);
	}
}

// Utility to manually trigger position check
export function checkPositionsNow() {
	if (navigator.serviceWorker.controller) {
		navigator.serviceWorker.controller.postMessage({
			type: 'CHECK_NOW',
		});
		console.log('Manual position check triggered');
	} else {
		console.warn('Service Worker controller not available');
	}
}

// Check if PWA is installed
export function isPWAInstalled(): boolean {
	return window.matchMedia('(display-mode: standalone)').matches ||
		(window.navigator as any).standalone === true;
}

// Show iOS install prompt
export function showIOSInstallPrompt(): boolean {
	const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
	const isInStandaloneMode = isPWAInstalled();
	
	return isIOS && !isInStandaloneMode;
}
