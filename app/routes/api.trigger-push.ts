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

interface AccountConfig {
  id: string;
  name: string;
  type: "LIVE" | "PAPER";
  apiKey: string;
  secretKey: string;
  baseUrl: string;
}

function getAccounts(): AccountConfig[] {
  const accounts: AccountConfig[] = [];

  // 1. Live Account
  if (process.env.ALPACA_LIVE_API_KEY && process.env.ALPACA_LIVE_SECRET_KEY) {
    accounts.push({
      id: "live",
      name: "Live Account",
      type: "LIVE",
      apiKey: process.env.ALPACA_LIVE_API_KEY,
      secretKey: process.env.ALPACA_LIVE_SECRET_KEY,
      baseUrl: "https://api.alpaca.markets",
    });
  }

  // 2. Paper Account (Default)
  if (process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) {
     const isSameAsLive = process.env.ALPACA_API_KEY === process.env.ALPACA_LIVE_API_KEY;
     if (!isSameAsLive) {
        accounts.push({
          id: "paper-default",
          name: "Paper Account",
          type: "PAPER",
          apiKey: process.env.ALPACA_API_KEY,
          secretKey: process.env.ALPACA_SECRET_KEY,
          baseUrl: "https://paper-api.alpaca.markets",
        });
     }
  }

  // 3. Additional Accounts
  if (process.env.ALPACA_ADDITIONAL_ACCOUNTS) {
    try {
      const additional = JSON.parse(process.env.ALPACA_ADDITIONAL_ACCOUNTS);
      if (Array.isArray(additional)) {
        additional.forEach((acc, index) => {
          if (acc.apiKey && acc.secretKey) {
            const type = acc.type === "LIVE" ? "LIVE" : "PAPER";
            accounts.push({
              id: `additional-${index}`,
              name: acc.name || `Additional ${type} ${index + 1}`,
              type: type,
              apiKey: acc.apiKey,
              secretKey: acc.secretKey,
              baseUrl: type === "LIVE" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets",
            });
          }
        });
      }
    } catch (e) {
      console.error("Failed to parse ALPACA_ADDITIONAL_ACCOUNTS", e);
    }
  }
  return accounts;
}

async function fetchAlpacaPositions(account: AccountConfig) {
  try {
    const response = await fetch(`${account.baseUrl}/v2/positions`, {
      headers: {
        "APCA-API-KEY-ID": account.apiKey,
        "APCA-API-SECRET-KEY": account.secretKey,
      },
    });
    
    if (!response.ok) {
      console.error(`Alpaca fetch failed for ${account.name}:`, await response.text());
      return null;
    }
    return await response.json();
  } catch (e) {
    console.error(`Alpaca fetch error for ${account.name}:`, e);
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

function formatNotification(type: 'opened' | 'closed', position: any, accountName: string) {
  const ticker = getUnderlyingTicker(position.symbol);
  const qty = Math.abs(parseFloat(position.qty));
  
  let title, body;
  
  if (type === 'opened') {
    const price = parseFloat(position.avg_entry_price);
    const costBasis = Math.abs(parseFloat(position.cost_basis));
    title = `[${accountName}] 📈 ${ticker} Position Opened`;
    body = `${qty} shares @ $${price.toFixed(2)} (Cost: $${costBasis.toFixed(2)})`;
  } else {
    const pl = parseFloat(position.unrealized_pl || 0);
    const plPct = (parseFloat(position.unrealized_plpc || 0) * 100).toFixed(2);
    title = `[${accountName}] 📊 ${ticker} Position Closed`;
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

  // 2. Process each account
  const accounts = getAccounts();
  console.log(`[Trigger Push] Processing ${accounts.length} accounts`);
  
  let totalNotifications = 0;
  const allNotifications = [];

  for (const account of accounts) {
    console.log(`[Trigger Push] Checking account: ${account.name}`);
    
    // Fetch current positions
    const currentPositions = await fetchAlpacaPositions(account);
    if (!currentPositions) {
      console.error(`[Trigger Push] Skipping ${account.name} due to fetch error`);
      continue;
    }

    // Get last positions from Redis
    const lastPositionsKey = `app:last_positions:${account.id}`;
    const lastPositionsData = await redis.get(lastPositionsKey);
    const lastPositions = Array.isArray(lastPositionsData) ? lastPositionsData : [];

    // Compare
    const changes = comparePositions(lastPositions, currentPositions);
    
    if (changes.opened.length > 0 || changes.closed.length > 0) {
        console.log(`[Trigger Push] ${account.name}: ${changes.opened.length} opened, ${changes.closed.length} closed`);
        
        for (const p of changes.opened) {
            allNotifications.push(formatNotification('opened', p, account.name));
        }
        for (const p of changes.closed) {
            allNotifications.push(formatNotification('closed', p, account.name));
        }
    }

    // Update Redis
    await redis.set(lastPositionsKey, currentPositions);
  }

  // 3. Send Notifications
  if (allNotifications.length > 0) {
    console.log(`[Trigger Push] Sending ${allNotifications.length} notifications`);
    for (const note of allNotifications) {
      const payload = JSON.stringify(note);
      
      await Promise.all(subscriptions.map((sub: PushSubscription) => 
        webpush.sendNotification(sub, payload).catch(err => 
          console.error("Failed to send notification:", err)
        )
      ));
    }
    totalNotifications = allNotifications.length;
  }

  return new Response(JSON.stringify({ 
    success: true, 
    changes: totalNotifications,
    message: `Sent ${totalNotifications} notifications` 
  }), {
    status: 200,
    headers,
  });
}

