import type { ActionFunctionArgs } from "react-router";
import webpush, { PushSubscription } from "web-push";
import { getSubscriptions } from "~/routes/api.subscribe";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  console.log("[Test Notification] Starting...");

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  webpush.setVapidDetails(
    "mailto:lohitaryan20@gmail.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const subscriptions = await getSubscriptions();
  console.log("[Test Notification] Found", subscriptions.length, "subscriptions");

  if (subscriptions.length === 0) {
    return new Response(JSON.stringify({ success: false, message: "No subscribers found." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mimic a real position opened notification
  const testPayload = JSON.stringify({
    title: "🧪 Test: AAPL Position Opened",
    body: "10 shares @ $150.00 (Cost: $1,500.00)",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "test-notification",
    data: { url: "/dashboard" },
  });

  let successCount = 0;

  await Promise.all(subscriptions.map(async (sub: PushSubscription) => {
    try {
      await webpush.sendNotification(sub, testPayload);
      successCount++;
    } catch (error) {
      console.error("Failed to send test notification:", error);
    }
  }));

  return new Response(JSON.stringify({ 
    success: true, 
    message: `Sent test notification to ${successCount} devices.` 
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
