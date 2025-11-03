import type { ActionFunctionArgs } from "react-router";
import webpush, { PushSubscription } from "web-push";
import { getSubscriptions } from "~/routes/api.subscribe";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subscriptions = getSubscriptions();

  if (subscriptions.length === 0) {
    return new Response(JSON.stringify({ success: true, message: "No subscribers to notify." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error("You must set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.");
    return new Response(JSON.stringify({ error: "VAPID keys not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  webpush.setVapidDetails(
    "mailto:your-email@example.com", // Replace with your email
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  // Empty payload - just wakes up the service worker to check positions
  const notificationPayload = JSON.stringify({});

  const promises = subscriptions.map((subscription: PushSubscription) => 
    webpush.sendNotification(subscription, notificationPayload).catch((err: Error) => {
      console.error("Failed to send notification to subscriber:", err);
      // Continue with other subscriptions even if one fails
      return null;
    })
  );

  try {
    const results = await Promise.all(promises);
    const successCount = results.filter((r: any) => r !== null).length;
    
    console.log(`[Trigger Push] ✅ Sent push to ${successCount}/${subscriptions.length} subscribers`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: `Triggered position check for ${successCount}/${subscriptions.length} subscribers.` 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Trigger Push] Error sending notifications:", error);
    return new Response(JSON.stringify({ error: "Failed to send notifications." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
