import type { ActionFunctionArgs } from "react-router";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Disable caching for this route
export function headers() {
  return {
    "Cache-Control": "no-store, max-age=0",
  };
}

// Disable caching for this route - for Vercel edge
export const config = {
  runtime: 'nodejs',
  maxDuration: 10,
};

export async function action({ request }: ActionFunctionArgs) {
  console.log("[Subscribe] Received request:", request.method);
  
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    "Vercel-CDN-Cache-Control": "max-age=0",
  };
  
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  const subscription = await request.json();
  console.log("[Subscribe] Parsed subscription:", JSON.stringify(subscription, null, 2));
  
  try {
    // Use the subscription endpoint as a unique key
    const endpoint = subscription.endpoint;
    console.log("[Subscribe] Endpoint:", endpoint);
    
    const key = `push:${Buffer.from(endpoint).toString('base64').slice(0, 50)}`;
    console.log("[Subscribe] Generated key:", key);
    
    // Store in Upstash Redis
    await redis.set(key, JSON.stringify(subscription));
    
    console.log("[Subscribe] ✅ Subscription saved to Upstash Redis");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[Subscribe] ❌ Error saving subscription:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to save subscription",
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers,
    });
  }
}

// Get all stored subscriptions
export async function getSubscriptions() {
  try {
    console.log("[Subscribe] Getting all subscriptions...");
    const keys = await redis.keys("push:*");
    console.log("[Subscribe] Found", keys.length, "keys:", keys);
    
    const subscriptions = await Promise.all(
      keys.map(async (key) => {
        const data = await redis.get(key);
        console.log("[Subscribe] Data for key", key, ":", typeof data);
        return typeof data === 'string' ? JSON.parse(data) : data;
      })
    );
    
    const filtered = subscriptions.filter(Boolean);
    console.log("[Subscribe] Returning", filtered.length, "subscriptions");
    return filtered;
  } catch (error) {
    console.error("[Subscribe] ❌ Error getting subscriptions:", error);
    return [];
  }
}

// Remove a single expired/invalid subscription by its endpoint URL.
export async function deleteSubscription(endpoint: string): Promise<void> {
  const key = `push:${Buffer.from(endpoint).toString('base64').slice(0, 50)}`;
  await redis.del(key);
  console.log("[Subscribe] 🗑️ Deleted subscription:", key);
}
