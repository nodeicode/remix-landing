import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import webpush, { PushSubscription } from "web-push";
import { getSubscriptions } from "~/routes/api.subscribe";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

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
  maxDuration: 60, // Increased duration for multiple fetches
};

// --- Helper Functions ---

async function fetchAlpacaPositions() {
  const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
  const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
  const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";

  if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
    console.error("Alpaca credentials missing");
    return null;
  }

  try {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/positions`, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
      },
    });
    
    if (!response.ok) {
      console.error("Alpaca fetch failed:", await response.text());
      return null;
    }
    return await response.json();
  } catch (e) {
    console.error("Alpaca fetch error:", e);
    return null;
  }
}

function getUnderlyingTicker(symbol: string) {
  const optionMatch = symbol.match(/^([A-Z]+)\d{6}[CP]/);
  return optionMatch ? optionMatch[1] : symbol;
}

function comparePositions(oldPositions: any[], newPositions: any[]) {
  const changes = {
    opened: [] as any[],
    closed: [] as any[],
  };

  const oldSymbols = new Set(oldPositions.map(p => p.symbol));
  const newSymbols = new Set(newPositions.map(p => p.symbol));

  // Find newly opened positions
  newPositions.forEach(position => {
    if (!oldSymbols.has(position.symbol)) {
      changes.opened.push(position);
    }
  });

  // Find closed positions
  oldPositions.forEach(position => {
    if (!newSymbols.has(position.symbol)) {
      changes.closed.push(position);
    }
  });

  return changes;
}

function formatNotification(type: 'opened' | 'closed', position: any) {
  const ticker = getUnderlyingTicker(position.symbol);
  const qty = Math.abs(parseFloat(position.qty));
  
  let title, body;
  
  if (type === 'opened') {
    const price = parseFloat(position.avg_entry_price);
    const costBasis = Math.abs(parseFloat(position.cost_basis));
    title = `📈 ${ticker} Position Opened`;
    body = `${qty} shares @ $${price.toFixed(2)} (Cost: $${costBasis.toFixed(2)})`;
  } else {
    const pl = parseFloat(position.unrealized_pl || 0);
    const plPct = (parseFloat(position.unrealized_plpc || 0) * 100).toFixed(2);
    title = `📊 ${ticker} Position Closed`;
    body = `${qty} shares - ${pl >= 0 ? 'Profit' : 'Loss'}: $${Math.abs(pl).toFixed(2)} (${pl >= 0 ? '+' : ''}${plPct}%)`;
  }

  return { title, body };
}

// --- Main Handler ---

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
  
  // 1. Get Subscriptions
  const subscriptions = await getSubscriptions();
  console.log("[Trigger Push] Found", subscriptions.length, "subscriptions");

  if (subscriptions.length === 0) {
    return new Response(JSON.stringify({ success: true, message: "No subscribers." }), { status: 200, headers });
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured." }), { status: 500, headers });
  }

  webpush.setVapidDetails(
    "mailto:lohitaryan20@gmail.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  // 2. Get Positions (Current & Previous)
  const currentPositions = await fetchAlpacaPositions();
  if (!currentPositions) {
    return new Response(JSON.stringify({ error: "Failed to fetch positions" }), { status: 500, headers });
  }

  const lastPositionsKey = "app:last_positions";
  const lastPositionsData = await redis.get(lastPositionsKey);
  const lastPositions = Array.isArray(lastPositionsData) ? lastPositionsData : [];

  // 3. Compare
  const changes = comparePositions(lastPositions, currentPositions);
  const hasChanges = changes.opened.length > 0 || changes.closed.length > 0;

  console.log(`[Trigger Push] Changes: ${changes.opened.length} opened, ${changes.closed.length} closed`);

  // 4. Send Notifications
  const notifications = [];
  
  for (const p of changes.opened) {
    notifications.push(formatNotification('opened', p));
  }
  for (const p of changes.closed) {
    notifications.push(formatNotification('closed', p));
  }

  if (notifications.length > 0) {
    for (const note of notifications) {
      const payload = JSON.stringify(note);
      
      await Promise.all(subscriptions.map((sub: PushSubscription) => 
        webpush.sendNotification(sub, payload).catch(err => 
          console.error("Failed to send notification:", err)
        )
      ));
    }
  }

  // 5. Update Redis
  await redis.set(lastPositionsKey, currentPositions);

  return new Response(JSON.stringify({ 
    success: true, 
    changes: notifications.length,
    message: `Sent ${notifications.length} notifications` 
  }), {
    status: 200,
    headers,
  });
}

