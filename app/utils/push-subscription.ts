// Utility functions for managing push notification subscriptions
/// <reference types="vite/client" />

// The VAPID public key is intentionally public — it is sent to the browser
// as part of every push subscription and does not need to be kept secret.
// Set VITE_VAPID_PUBLIC_KEY in your .env file (same value as VAPID_PUBLIC_KEY).
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

// Convert VAPID public key from base64 to Uint8Array
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Subscribe to push notifications
export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string = VAPID_PUBLIC_KEY
): Promise<PushSubscription | null> {
  try {
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Subscribe to push notifications
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      console.log("[Push] ✅ Subscribed to push notifications");

      // Send subscription to server
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (response.ok) {
        console.log("[Push] ✅ Subscription sent to server");
      } else {
        console.error("[Push] ❌ Failed to send subscription to server");
      }
    } else {
      console.log("[Push] ✅ Already subscribed to push notifications");
    }

    return subscription;
  } catch (error) {
    console.error("[Push] ❌ Failed to subscribe to push notifications:", error);
    return null;
  }
}
