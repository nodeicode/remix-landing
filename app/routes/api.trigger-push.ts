import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import webpush, { PushSubscription } from "web-push";
import { getSubscriptions } from "~/routes/api.subscribe";

// Handle GET requests (Vercel cron uses GET by default)
export async function loader({ request }: LoaderFunctionArgs) {
  return handleTrigger();
}

// Handle POST requests
export async function action({ request }: ActionFunctionArgs) {
  return handleTrigger();
}

async function handleTrigger() {
  console.log("[Trigger Push] Starting...");
  
  // Disable caching
  const noCacheHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
  };
  
  const subscriptions = await getSubscriptions();
  console.log("[Trigger Push] Found", subscriptions.length, "subscriptions");

  if (subscriptions.length === 0) {
    console.log("[Trigger Push] No subscribers to notify");
    return new Response(JSON.stringify({ success: true, message: "No subscribers to notify." }), {
      status: 200,
      headers: noCacheHeaders,
    });
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error("You must set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.");
    return new Response(JSON.stringify({ error: "VAPID keys not configured." }), {
      status: 500,
      headers: noCacheHeaders,
    });
  }

  webpush.setVapidDetails(
    "mailto:lohitaryan20@gmail.com",
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
      headers: noCacheHeaders,
    });
  } catch (error) {
    console.error("[Trigger Push] Error sending notifications:", error);
    return new Response(JSON.stringify({ error: "Failed to send notifications." }), {
      status: 500,
      headers: noCacheHeaders,
    });
  }
}
