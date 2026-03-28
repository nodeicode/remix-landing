import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { parseNumberedAccounts } from "../utils/env.server";
import webpush, { PushSubscription } from "web-push";
import { getSubscriptions, deleteSubscription } from "~/routes/api.subscribe";
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

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
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

interface AlpacaActivity {
  id: string;
  activity_type: string;
  transaction_time: string;
  price: string;
  qty: string;
  side: string;
  symbol: string;
}

function getAccounts(): AccountConfig[] {
  const accounts: AccountConfig[] = [];

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

  if (process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) {
    const isSameAsLive = process.env.ALPACA_API_KEY === process.env.ALPACA_LIVE_API_KEY;
    if (!isSameAsLive) {
      accounts.push({
        id: "paper-default",
        name: "Paper Testing Account",
        type: "PAPER",
        apiKey: process.env.ALPACA_API_KEY,
        secretKey: process.env.ALPACA_SECRET_KEY,
        baseUrl: "https://paper-api.alpaca.markets",
      });
    }
  }

  parseNumberedAccounts().forEach((acc, index) => {
    accounts.push({
      id: `additional-${index}`,
      name: acc.name,
      type: acc.type,
      apiKey: acc.apiKey,
      secretKey: acc.secretKey,
      baseUrl: acc.type === "LIVE" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets",
    });
  });

  return accounts;
}

// Fetch the most recent 100 FILL + OPEXP activities (newest-first).
async function fetchRecentActivities(account: AccountConfig): Promise<AlpacaActivity[] | null> {
  const headers = {
    "APCA-API-KEY-ID": account.apiKey,
    "APCA-API-SECRET-KEY": account.secretKey,
  };
  try {
    const [fillRes, opexpRes] = await Promise.all([
      fetch(`${account.baseUrl}/v2/account/activities/FILL?page_size=100`, { headers }),
      fetch(`${account.baseUrl}/v2/account/activities/OPEXP?page_size=100`, { headers }),
    ]);

    const fills: AlpacaActivity[] = fillRes.ok ? await fillRes.json() : [];
    const opexps: AlpacaActivity[] = opexpRes.ok ? await opexpRes.json() : [];

    // Merge and sort newest-first
    return [...fills, ...opexps].sort(
      (a, b) => new Date(b.transaction_time).getTime() - new Date(a.transaction_time).getTime()
    );
  } catch (e) {
    console.error(`Activity fetch error for ${account.name}:`, e);
    return null;
  }
}

function getUnderlyingTicker(symbol: string) {
  const match = symbol.match(/^([A-Z]+)\d{6}[CP]/);
  return match ? match[1] : symbol;
}

function formatActivityNotification(activity: AlpacaActivity, accountName: string) {
  const ticker = getUnderlyingTicker(activity.symbol);
  const isOption = /^[A-Z]+\d{6}[CP]/.test(activity.symbol);
  const qty = Math.abs(parseFloat(activity.qty));
  const price = parseFloat(activity.price);
  const value = price * qty * (isOption ? 100 : 1);

  let title: string;
  let body: string;

  if (activity.activity_type === 'OPEXP') {
    title = `[${accountName}] ⏰ ${ticker} Option Expired`;
    body = `${activity.symbol} expired worthless`;
  } else if (activity.side.startsWith('sell')) {
    title = `[${accountName}] 🔴 ${ticker} Sold`;
    body = `${qty}${isOption ? ' contracts' : ' shares'} @ $${price.toFixed(2)} · $${value.toFixed(2)} proceeds`;
  } else {
    title = `[${accountName}] 🟢 ${ticker} Bought`;
    body = `${qty}${isOption ? ' contracts' : ' shares'} @ $${price.toFixed(2)} · $${value.toFixed(2)} cost`;
  }

  return { title, body, tag: `fill-${activity.id}`, data: { url: '/dashboard' } };
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

  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error("[Trigger Push] Unauthorized request");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
  }

  // 1. Get subscriptions early — no point continuing if no one is subscribed
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

  // 2. For each account, find activities newer than the last-seen cursor
  const accounts = getAccounts();
  const allNotifications: ReturnType<typeof formatActivityNotification>[] = [];

  for (const account of accounts) {
    console.log(`[Trigger Push] Checking account: ${account.name}`);

    const activities = await fetchRecentActivities(account);
    if (!activities) continue;

    // Redis cursor: the ID of the newest activity we already notified about.
    // Alpaca activity IDs are lexicographically sortable (timestamp-prefixed).
    const cursorKey = `app:last_activity_id:${account.id}`;
    const lastSeenId: string | null = await redis.get(cursorKey);

    // Activities are sorted newest-first; find the index of the last-seen one
    const newActivities = lastSeenId
      ? activities.filter(a => a.id > lastSeenId)
      : [];  // First run: don't spam — just set the cursor

    if (newActivities.length > 0) {
      console.log(`[Trigger Push] ${account.name}: ${newActivities.length} new activities`);
      for (const a of newActivities) {
        allNotifications.push(formatActivityNotification(a, account.name));
      }
    }

    // Always advance cursor to the newest activity ID we saw this run
    if (activities.length > 0) {
      await redis.set(cursorKey, activities[0].id);
    }
  }

  // 3. Send notifications
  if (allNotifications.length > 0) {
    console.log(`[Trigger Push] Sending ${allNotifications.length} notifications`);
    for (const note of allNotifications) {
      const payload = JSON.stringify(note);
      await Promise.all(
        subscriptions.map((sub: PushSubscription) =>
          webpush.sendNotification(sub, payload).catch(async (err: any) => {
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              await deleteSubscription(sub.endpoint);
            } else {
              console.error("Failed to send notification:", err);
            }
          })
        )
      );
    }
  }

  return new Response(JSON.stringify({
    success: true,
    changes: allNotifications.length,
    message: `Sent ${allNotifications.length} notifications`,
  }), { status: 200, headers });
}


