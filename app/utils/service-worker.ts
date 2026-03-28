// Service Worker registration and push subscription utility.
// Call registerServiceWorker() once on app mount.
// Call subscribeToNotifications() when the user grants permission.

import { subscribeToPush } from "./push-subscription";

export async function registerServiceWorker(): Promise<void> {
	if (!("serviceWorker" in navigator)) return;
	try {
		await navigator.serviceWorker.register("/sw.js");
		console.log("[SW] Registered");
	} catch (err) {
		console.error("[SW] Registration failed:", err);
	}
}

export async function subscribeToNotifications(): Promise<boolean> {
	if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await subscribeToPush(registration);
		return subscription !== null;
	} catch (err) {
		console.error("[Push] subscribeToNotifications failed:", err);
		return false;
	}
}

// Check if PWA is installed
export function isPWAInstalled(): boolean {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(window.navigator as any).standalone === true
	);
}
