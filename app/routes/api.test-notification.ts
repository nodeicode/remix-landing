import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import webpush, { PushSubscription } from "web-push";
import { getSubscriptions } from "~/routes/api.subscribe";

// Handle GET requests - send test notification
export async function loader({ request }: LoaderFunctionArgs) {
	return handleTestNotification();
}

// Disable caching for this route
export const config = {
	runtime: 'nodejs',
	maxDuration: 10,
};

// Handle POST requests - send test notification
export async function action({ request }: ActionFunctionArgs) {
	return handleTestNotification();
}

async function handleTestNotification() {
	console.log("[Test Notification] Starting...");

	const subscriptions = await getSubscriptions();
	console.log("[Test Notification] Found", subscriptions.length, "subscriptions");

	const headers = {
		"Content-Type": "application/json",
		"Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
		"Vercel-CDN-Cache-Control": "max-age=0",
	};

	if (subscriptions.length === 0) {
		return new Response(
			JSON.stringify({
				success: false,
				message:
					"No subscribers found. Make sure you've allowed notifications on the dashboard.",
			}),
			{
				status: 200,
				headers,
			}
		);
	}

	if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
		console.error("[Test Notification] VAPID keys not configured");
		return new Response(
			JSON.stringify({
				error: "VAPID keys not configured.",
			}),
			{
				status: 500,
				headers,
			}
		);
	}

	webpush.setVapidDetails(
		"mailto:lohitaryan20@gmail.com",
		process.env.VAPID_PUBLIC_KEY,
		process.env.VAPID_PRIVATE_KEY
	);

	// Send a test notification with content
	const notificationPayload = JSON.stringify({
		title: "🧪 Test Notification",
		body: "If you see this, push notifications are working! 🎉",
		icon: "/favicon.ico",
		badge: "/favicon.ico",
	});

	const promises = subscriptions.map((subscription: PushSubscription) =>
		webpush.sendNotification(subscription, notificationPayload).catch((err: Error) => {
			console.error("[Test Notification] Failed to send to subscriber:", err.message);
			return null;
		})
	);

	try {
		const results = await Promise.all(promises);
		const successCount = results.filter((r: any) => r !== null).length;
		const failedCount = subscriptions.length - successCount;

		console.log(
			`[Test Notification] ✅ Sent to ${successCount}/${subscriptions.length} subscribers`
		);

		return new Response(
			JSON.stringify({
				success: true,
				message: `Test notification sent!`,
				details: {
					total: subscriptions.length,
					successful: successCount,
					failed: failedCount,
				},
			}),
			{
				status: 200,
				headers,
			}
		);
	} catch (error) {
		console.error("[Test Notification] Error:", error);
		return new Response(
			JSON.stringify({
				error: "Failed to send test notification.",
				details: error instanceof Error ? error.message : String(error),
			}),
			{
				status: 500,
				headers,
			}
		);
	}
}
