import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import webpush, { PushSubscription } from "web-push";
import { getSubscriptions } from "~/routes/api.subscribe";

// Disable caching for this route
export function headers() {
  return {
    "Cache-Control": "no-store, max-age=0",
  };
}

// Handle OPTIONS for CORS preflight
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
  return handleTrigger(request);
}

// Handle POST requests
export async function action({ request }: ActionFunctionArgs) {
  return handleTrigger(request);
}

// Disable caching for this route - for Vercel edge
export const config = {
  runtime: 'nodejs',
  maxDuration: 10,
};

async function handleTrigger(request: Request) {
  console.log("[Trigger Push] Starting...");
  
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    "Vercel-CDN-Cache-Control": "max-age=0",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Check authorization if CRON_SECRET is set
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    if (authHeader !== expectedAuth) {
      console.error("[Trigger Push] Unauthorized request");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }
  }
  
  const subscriptions = await getSubscriptions();
  console.log("[Trigger Push] Found", subscriptions.length, "subscriptions");

  if (subscriptions.length === 0) {
    console.log("[Trigger Push] No subscribers to notify");
    return new Response(JSON.stringify({ success: true, message: "No subscribers to notify." }), {
      status: 200,
      headers,
    });
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error("You must set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.");
    return new Response(JSON.stringify({ error: "VAPID keys not configured." }), {
      status: 500,
      headers,
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
      headers,
    });
  } catch (error) {
    console.error("[Trigger Push] Error sending notifications:", error);
    return new Response(JSON.stringify({ error: "Failed to send notifications." }), {
      status: 500,
      headers,
    });
  }
}
