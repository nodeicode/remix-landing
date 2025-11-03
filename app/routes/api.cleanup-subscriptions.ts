import type { LoaderFunctionArgs } from "react-router";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// DELETE /api/cleanup-subscriptions - Remove all subscriptions (for debugging)
export async function loader({ request }: LoaderFunctionArgs) {
  console.log("[Cleanup] Starting subscription cleanup...");
  
  try {
    const keys = await redis.keys("push:*");
    console.log("[Cleanup] Found", keys.length, "subscriptions to delete");
    
    if (keys.length > 0) {
      await Promise.all(keys.map(key => redis.del(key)));
      console.log("[Cleanup] ✅ Deleted all subscriptions");
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted ${keys.length} subscriptions. Please refresh the dashboard to re-subscribe.`,
        deleted: keys.length,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to cleanup subscriptions",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
