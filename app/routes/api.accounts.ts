import type { LoaderFunctionArgs } from "react-router";
import { parseEnvJson } from "../utils/env.server";

// Types for Alpaca API responses
interface PortfolioHistoryData {
	timestamp: number[];
	equity: number[];
	profit_loss: number[];
	profit_loss_pct: number[];
	base_value: number;
	timeframe: string;
}

interface Position {
	asset_id: string;
	symbol: string;
	exchange: string;
	asset_class: string;
	avg_entry_price: string;
	qty: string;
	side: string;
	market_value: string;
	cost_basis: string;
	unrealized_pl: string;
	unrealized_plpc: string;
	unrealized_intraday_pl: string;
	unrealized_intraday_plpc: string;
	current_price: string;
	lastday_price: string;
	change_today: string;
}

interface Activity {
	id: string;
	activity_type: string;
	transaction_time: string;
	type: string;
	price: string;
	qty: string;
	side: string;
	symbol: string;
	leaves_qty: string;
	order_id: string;
	cum_qty: string;
	order_status: string;
}

interface AccountConfig {
	id: string;
	name: string;
	type: "LIVE" | "PAPER";
	apiKey: string;
	secretKey: string;
	baseUrl: string;
}

interface AccountData {
	id: string;
	name: string;
	type: "LIVE" | "PAPER";
	portfolioHistory: Record<string, PortfolioHistoryData>;
	positions: Position[];
	activities: Activity[];
	legToParentOrder: Record<string, string>;
	buyingPower?: number;
	equity?: number;
}

// Helper to fetch data for a single account
async function fetchAccountData(config: AccountConfig): Promise<AccountData | null> {
	const { apiKey, secretKey, baseUrl, id, name, type } = config;
	const headers = {
		"APCA-API-KEY-ID": apiKey,
		"APCA-API-SECRET-KEY": secretKey,
	};

	try {
		// Fetch Account Info (for equity/buying power)
		const accountResponse = await fetch(`${baseUrl}/v2/account`, { headers });
		let accountInfo = null;
		if (accountResponse.ok) {
			accountInfo = await accountResponse.json();
		}

		// Fetch portfolio history
		const timeframes = ["1D", "1W", "1M", "3M", "ALL"];
		const portfolioHistoryPromises = timeframes.map(async (timeframe) => {
			const period =
				timeframe === "1D"
					? "1D"
					: timeframe === "1W"
						? "1W"
						: timeframe === "1M"
							? "1M"
							: timeframe === "3M"
								? "3M"
								: "all";

			const historyUrl = `${baseUrl}/v2/account/portfolio/history?period=${period}&timeframe=${
				timeframe === "1D" ? "5Min" : timeframe === "1W" ? "1H" : "1D"
			}`;

			const response = await fetch(historyUrl, { headers });
			if (!response.ok) return { timeframe, data: null };
			return { timeframe, data: await response.json() };
		});

		// Fetch positions
		const positionsResponse = await fetch(`${baseUrl}/v2/positions`, { headers });
		const positions: Position[] = positionsResponse.ok ? await positionsResponse.json() : [];

		// Fetch closed orders with nested=true to map multi-leg child orders → parent order
		const legToParentOrder: Record<string, string> = {};
		try {
			const ordersUrl = `${baseUrl}/v2/orders?status=closed&nested=true&limit=500`;
			const ordersResponse = await fetch(ordersUrl, { headers });
			if (ordersResponse.ok) {
				const orders: any[] = await ordersResponse.json();
				for (const order of orders) {
					if (Array.isArray(order.legs)) {
						for (const leg of order.legs) {
							legToParentOrder[leg.id] = order.id;
						}
					}
				}
			}
		} catch (e) {
			console.error(`Error fetching orders for account ${name}:`, e);
		}

		// Fetch activities
		let allActivities: Activity[] = [];
		let pageToken: string | null = null;
		const maxActivities = 500;
		const pageSize = 100;

		while (allActivities.length < maxActivities) {
			const activitiesUrl: string = pageToken
				? `${baseUrl}/v2/account/activities/FILL?page_size=${pageSize}&page_token=${pageToken}`
				: `${baseUrl}/v2/account/activities/FILL?page_size=${pageSize}`;

			const activitiesResponse: Response = await fetch(activitiesUrl, { headers });
			if (!activitiesResponse.ok) break;

			const pageActivities: Activity[] = await activitiesResponse.json();
			allActivities = [...allActivities, ...pageActivities];

			const nextPageToken: string | null = activitiesResponse.headers.get("x-page-token");
			if (!nextPageToken || pageActivities.length < pageSize) break;
			pageToken = nextPageToken;
		}

		const portfolioHistoryResults = await Promise.all(portfolioHistoryPromises);
		const portfolioHistoryMap = Object.fromEntries(
			portfolioHistoryResults
				.filter((r) => r.data !== null)
				.map(({ timeframe, data }) => [timeframe, data])
		);

		return {
			id,
			name,
			type,
			portfolioHistory: portfolioHistoryMap,
			positions,
			activities: allActivities,
			legToParentOrder,
			buyingPower: accountInfo ? parseFloat(accountInfo.buying_power) : 0,
			equity: accountInfo ? parseFloat(accountInfo.equity) : 0,
		};
	} catch (error) {
		console.error(`Error fetching data for account ${name}:`, error);
		return null;
	}
}

export async function loader({ request }: LoaderFunctionArgs) {
	const accountsToFetch: AccountConfig[] = [];
	const seenApiKeys = new Set<string>();

	const addAccount = (account: AccountConfig) => {
		if (!account.apiKey || !account.secretKey) return;

		const normalizedKey = account.apiKey.trim();
		// Check if we already have this account (by API key)
		if (seenApiKeys.has(normalizedKey)) {
			return;
		}

		seenApiKeys.add(normalizedKey);
		accountsToFetch.push(account);
	};

	// 1. Check for Live Account
	if (process.env.ALPACA_LIVE_API_KEY && process.env.ALPACA_LIVE_SECRET_KEY) {
		addAccount({
			id: "live",
			name: "Live Account",
			type: "LIVE",
			apiKey: process.env.ALPACA_LIVE_API_KEY,
			secretKey: process.env.ALPACA_LIVE_SECRET_KEY,
			baseUrl: "https://api.alpaca.markets",
		});
	}

	// 2. Check for Paper Account (using default keys)
	if (process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) {
		addAccount({
			id: "paper-default",
			name: "Paper Account",
			type: "PAPER",
			apiKey: process.env.ALPACA_API_KEY,
			secretKey: process.env.ALPACA_SECRET_KEY,
			baseUrl: "https://paper-api.alpaca.markets",
		});
	}

	const additionalData = parseEnvJson<any>("ALPACA_ADDITIONAL_ACCOUNTS");
	if (additionalData) {
		// Support both { accounts: [...] } and [...] formats
		const additionalAccounts = Array.isArray(additionalData)
			? additionalData
			: additionalData.accounts;

		if (Array.isArray(additionalAccounts)) {
				additionalAccounts.forEach((acc, index) => {
					const type = acc.type === "LIVE" ? "LIVE" : "PAPER";
					addAccount({
						id: `additional-${index}`,
						name: acc.name || `Additional ${type} ${index + 1}`,
						type: type,
						apiKey: acc.apiKey,
						secretKey: acc.secretKey,
						baseUrl:
							type === "LIVE"
								? "https://api.alpaca.markets"
								: "https://paper-api.alpaca.markets",
					});
				});
			}
	}

	if (accountsToFetch.length === 0) {
		return Response.json(
			{ error: "No Alpaca accounts configured" }
		);
	}
	
	// Fetch all accounts in parallel
	const results = await Promise.all(accountsToFetch.map(fetchAccountData));
	const accounts = results.filter((a): a is AccountData => a !== null);

	// Sort: Live first, then Paper
	accounts.sort((a, b) => {
		if (a.type === "LIVE" && b.type === "PAPER") return -1;
		if (a.type === "PAPER" && b.type === "LIVE") return 1;
		return 0;
	});

	return Response.json({ accounts });
}
