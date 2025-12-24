# Push Notification Setup Guide

## Overview

The service worker now uses the Push API to enable autonomous position checking. The server will send push notifications every hour to wake up the service worker, which then checks for position changes.

## Setup Steps

### 1. Generate VAPID Keys

Run this command to generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Save the output. You'll need to add these to your environment variables:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

### 2. Update Environment Variables

Add to your `.env` file:

```
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
```

### 3. Update Dashboard Component

The dashboard now includes a **Notification Permission** button/indicator that:

- ✅ Shows current notification permission status
- ✅ Allows users to enable notifications with one click
- ✅ Displays helpful messages for denied permissions

The component is already added to the dashboard. Replace the useEffect in `app/routes/dashboard.tsx` (around line 188) with:

```typescript
// Register service worker and subscribe to push notifications
useEffect(() => {
	if ("serviceWorker" in navigator) {
		navigator.serviceWorker
			.register("/sw.js")
			.then(async (registration) => {
				console.log("[Dashboard] Service Worker registered:", registration);

				// Request notification permission
				let permission = Notification.permission;
				if ("Notification" in window && permission === "default") {
					permission = await Notification.requestPermission();
					console.log("[Dashboard] Notification permission:", permission);
				}

				// Subscribe to push notifications if permission granted
				if (permission === "granted") {
					try {
						// Wait for service worker to be ready
						await navigator.serviceWorker.ready;

						// IMPORTANT: Replace with your actual VAPID public key from step 1
						const vapidPublicKey = "YOUR_VAPID_PUBLIC_KEY_HERE";

						// Check if already subscribed
						let subscription = await registration.pushManager.getSubscription();

						if (!subscription) {
							// Helper function to convert VAPID key
							const urlBase64ToUint8Array = (base64String: string) => {
								const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
								const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
								const rawData = window.atob(base64);
								const outputArray = new Uint8Array(rawData.length);
								for (let i = 0; i < rawData.length; ++i) {
									outputArray[i] = rawData.charCodeAt(i);
								}
								return outputArray;
							};

							// Subscribe to push notifications
							subscription = await registration.pushManager.subscribe({
								userVisibleOnly: true,
								applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
							});

							console.log("[Dashboard] ✅ Subscribed to push notifications");

							// Send subscription to server
							await fetch("/api/subscribe", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify(subscription.toJSON()),
							});

							console.log("[Dashboard] ✅ Subscription sent to server");
						} else {
							console.log("[Dashboard] ✅ Already subscribed to push notifications");
						}
					} catch (error) {
						console.error("[Dashboard] ❌ Failed to subscribe to push notifications:", error);
					}
				}

				// Listen for messages from service worker
				const handleMessage = (event: MessageEvent) => {
					console.log("[Dashboard] Service worker message:", event.data);

					// Revalidate data when sync completes with changes
					if (event.data.type === "SYNC_COMPLETED" && event.data.hasChanges) {
						console.log("[Dashboard] 🔄 Position changes detected!");
						revalidator.revalidate();
					}
				};

				navigator.serviceWorker.addEventListener("message", handleMessage);

				// Cleanup listener on unmount
				return () => {
					navigator.serviceWorker.removeEventListener("message", handleMessage);
				};
			})
			.catch((error) => {
				console.error("[Dashboard] Service Worker registration failed:", error);
			});
	}
}, [revalidator]);
```

### 4. Install web-push Package

```bash
npm install web-push
npm install -D @types/web-push
```

### 5. Set Up Automated Trigger

You need to call `/api/trigger-push` every hour to wake up the service workers. Options:

#### Option A: Vercel Cron Jobs

Created `vercel.json`:

```json
{
	"crons": [
		{
			"path": "/api/trigger-push",
			"schedule": "0 * * * *"
		}
	]
}
```

#### Option B: External Cron Service

- cron-job.org

was setup to trigger api endpoint 10am to 4pm every hour every weekday.
(3rd party service was chosen since vercel cron cannot guarentee if cron job is executed at 10:05 rather a loose range 10:05 to 11:04)

## How It Works

1. **User visits dashboard** → Service worker registers and subscribes to push notifications
2. **Server (cron job)** → Calls `/api/trigger-push` every hour
3. **Trigger endpoint** → Sends push notification to all subscribed clients
4. **Service worker wakes up** → Receives push, calls `/api/positions` to check for changes
5. **If changes detected** → Service worker sends browser notification with trade details
6. **Dashboard updates** → Revalidates data when it receives message from service worker

## Browser Support

✅ Chrome/Edge (desktop & mobile)
✅ Firefox (desktop & mobile)
✅ Safari (iOS 16.4+)
✅ Samsung Internet

## Important Notes

- Push notifications work even when the browser is closed (on mobile)
- Users must grant notification permission
- Service worker must be served over HTTPS (except localhost)
- In production, use a database to store subscriptions (not in-memory array)
