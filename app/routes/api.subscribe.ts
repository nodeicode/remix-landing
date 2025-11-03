import type { ActionFunctionArgs } from "react-router";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subscription = await request.json();
  
  try {
    // Use the subscription endpoint as a unique key
    const endpoint = subscription.endpoint;
    const key = `push:${Buffer.from(endpoint).toString('base64').slice(0, 50)}`;
    
    // Store in Upstash Redis
    await redis.set(key, JSON.stringify(subscription));
    
    console.log("[Subscribe] ✅ Subscription saved to Upstash Redis");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Subscribe] ❌ Error saving subscription:", error);
    return new Response(JSON.stringify({ error: "Failed to save subscription" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Get all stored subscriptions
export async function getSubscriptions() {
  try {
    const keys = await redis.keys("push:*");
    const subscriptions = await Promise.all(
      keys.map(async (key) => {
        const data = await redis.get(key);
        return typeof data === 'string' ? JSON.parse(data) : data;
      })
    );
    return subscriptions.filter(Boolean);
  } catch (error) {
    console.error("[Subscribe] ❌ Error getting subscriptions:", error);
    return [];
  }
}
