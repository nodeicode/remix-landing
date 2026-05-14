import type { LoaderFunctionArgs } from "react-router";
import { parseNumberedAccounts } from "../utils/env.server";

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
	orderIdToSource: Record<string, string>;
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
		const orderIdToSource: Record<string, string> = {};
		try {
		const ordersUrl = `${baseUrl}/v2/orders?status=closed&nested=true&limit=500&direction=desc`;
			const ordersResponse = await fetch(ordersUrl, { headers });
			if (ordersResponse.ok) {
				const orders: any[] = await ordersResponse.json();
				for (const order of orders) {
					if (order.source) orderIdToSource[order.id] = order.source;
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

		// Fetch FILL activities (paginated). `after` is only sent on the first request
		// because Alpaca rejects requests that combine `after` with `page_token`.
		// Direction is desc (newest-first) by default; FIFO re-sorts by timestamp anyway.
		let allActivities: Activity[] = [];
		let pageToken: string | null = null;
		const maxActivities = 10_000;
		const pageSize = 100;
		const twoYearsAgo = new Date();
		twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
		const afterDate = encodeURIComponent(twoYearsAgo.toISOString());

		while (allActivities.length < maxActivities) {
			// page_token is the sole cursor on page 2+; mixing it with `after` breaks Alpaca pagination
			const activitiesUrl = pageToken
				? `${baseUrl}/v2/account/activities/FILL?page_size=${pageSize}&page_token=${encodeURIComponent(pageToken)}`
				: `${baseUrl}/v2/account/activities/FILL?page_size=${pageSize}&after=${afterDate}`;

			const activitiesResponse: Response = await fetch(activitiesUrl, { headers });
			if (!activitiesResponse.ok) break;

			const pageActivities: Activity[] = await activitiesResponse.json();
			if (pageActivities.length === 0) break;

			allActivities = [...allActivities, ...pageActivities];
			if (pageActivities.length < pageSize) break;

			// The oldest item in this page becomes the cursor for the next (older) page
			const oldest = pageActivities[pageActivities.length - 1];
			if (new Date(oldest.transaction_time) < twoYearsAgo) break;
			pageToken = oldest.id;
		}
		console.log(`[API] ${name}: fetched ${allActivities.length} FILL activities`);

		// Fetch OPEXP (option expiration) activities — fired when options expire rather
		// than being bought/sold to close. Without these, an IC that expires worthless
		// shows open fills in the FIFO queue with nothing to match against → invisible.
		try {
			let opexpAll: any[] = [];
			let opexpToken: string | null = null;
			while (opexpAll.length < 2000) {
				const opexpUrl = opexpToken
					? `${baseUrl}/v2/account/activities/OPEXP?page_size=${pageSize}&page_token=${encodeURIComponent(opexpToken)}`
					: `${baseUrl}/v2/account/activities/OPEXP?page_size=${pageSize}&after=${afterDate}`;
				const opexpResponse = await fetch(opexpUrl, { headers });
				if (!opexpResponse.ok) break;
				const opexpPage: any[] = await opexpResponse.json();
				if (opexpPage.length === 0) break;
				opexpAll = [...opexpAll, ...opexpPage];
				if (opexpPage.length < pageSize) break;
				opexpToken = opexpPage[opexpPage.length - 1].id;
			}
			console.log(`[API] ${name}: fetched ${opexpAll.length} OPEXP activities`);
			for (const exp of opexpAll) {
				if (!exp.symbol) continue;
				// `date` is the expiry date; fall back to id as a last resort
				const expiryDate = (exp.date as string) ?? (exp.id as string).slice(0, 10);
				// Group all legs that share the same underlying + expiry date under one
				// synthetic orderId so buildTradeGroups shows them as a single IC row.
				const underlying =
					(exp.symbol as string).match(/^([A-Z]+)\d{6}[CP]/)?.[1] ?? exp.symbol;
				const syntheticOrderId = `opexp_${underlying}_${expiryDate}`;
				allActivities.push({
					id: exp.id,
					activity_type: 'OPEXP',
					transaction_time: `${expiryDate}T23:59:59Z`,
					type: (exp.type as string) || 'expiration',
					price: String(exp.price ?? 0),
					qty: String(Math.abs(parseFloat(exp.qty || '0'))),
					side: '', // FIFO infers direction from queue state
					symbol: exp.symbol,
					leaves_qty: '0',
					order_id: syntheticOrderId,
					cum_qty: String(Math.abs(parseFloat(exp.qty || '0'))),
					order_status: 'filled',
				});
			}
		} catch (e) {
			console.error(`[API] Error fetching OPEXP for account ${name}:`, e);
		}

		const portfolioHistoryResults = await Promise.all(portfolioHistoryPromises);
		const portfolioHistoryMap: Record<string, PortfolioHistoryData> = Object.fromEntries(
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
			orderIdToSource,
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
			name: "Paper Testing",
			type: "PAPER",
			apiKey: process.env.ALPACA_API_KEY,
			secretKey: process.env.ALPACA_SECRET_KEY,
			baseUrl: "https://paper-api.alpaca.markets",
		});
	}

	parseNumberedAccounts().forEach((acc, index) => {
		addAccount({
			id: `additional-${index}`,
			name: acc.name,
			type: acc.type,
			apiKey: acc.apiKey,
			secretKey: acc.secretKey,
			baseUrl:
				acc.type === "LIVE"
					? "https://api.alpaca.markets"
					: "https://paper-api.alpaca.markets",
		});
	});

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
