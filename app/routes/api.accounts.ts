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

interface CashFlow {
	time: number;
	amount: number;
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
	/** Non-trading cash flows (CSD/CSW/JNLC). Positive = inflow, negative = outflow. */
	cashFlows: CashFlow[];
	buyingPower?: number;
	equity?: number;
}

/** Cash flows within [periodStart, ∞), excluding initial funding that matches opening equity. */
function getPeriodCashFlows(
	cashFlows: CashFlow[],
	periodStart: number,
	firstRawEquity: number,
): CashFlow[] {
	const inPeriod = cashFlows.filter((cf) => cf.time >= periodStart);
	if (inPeriod.length === 1 && inPeriod[0].amount > 0 && firstRawEquity > 0) {
		const cf = inPeriod[0];
		// Paper JNLC initial funding often settles after the first equity snapshot but
		// matches opening balance — subtracting it would double-count capital.
		if (Math.abs(cf.amount - firstRawEquity) / firstRawEquity < 0.02) {
			return [];
		}
	}
	return inPeriod;
}

async function fetchPaginatedActivities(
	baseUrl: string,
	headers: Record<string, string>,
	activityType: string,
	afterDate: string,
	pageSize: number,
	maxItems: number,
): Promise<any[]> {
	const all: any[] = [];
	let pageToken: string | null = null;

	while (all.length < maxItems) {
		const url = pageToken
			? `${baseUrl}/v2/account/activities/${activityType}?page_size=${pageSize}&page_token=${encodeURIComponent(pageToken)}`
			: `${baseUrl}/v2/account/activities/${activityType}?page_size=${pageSize}&after=${afterDate}`;

		const response = await fetch(url, { headers });
		if (!response.ok) break;

		const page: any[] = await response.json();
		if (page.length === 0) break;

		all.push(...page);
		if (page.length < pageSize) break;
		pageToken = page[page.length - 1].id;
	}

	return all;
}

/**
 * Centralised post-processing applied to every portfolio history timeframe
 * before the data leaves the server.  All graph normalisation lives here so
 * the UI never needs to touch raw Alpaca values.
 *
 * Steps (applied per timeframe):
 *  1. Strip zero-equity buckets – Alpaca emits zeroes for non-trading hours
 *     which crush the Y-axis range and corrupt trend-lines.
 *  2. Patch the LAST existing point in-place with the current live equity so
 *     every timeframe chart is always up-to-date.  We intentionally never
 *     append a synthetic new point – that previously caused a discontinuity
 *     spike when the last Alpaca bucket was stale by more than one period.
 *  3. Subtract cumulative deposits/withdrawals (CSD/CSW/JNLC) at each timestamp
 *     so the equity curve reflects trading performance only, not capital flows.
 *  4. Recompute profit_loss and profit_loss_pct from the adjusted series using
 *     the first adjusted point as base_value.
 */
function normalizePortfolioHistory(
	map: Record<string, PortfolioHistoryData>,
	liveEquity: number,
	cashFlows: CashFlow[],
): void {
	for (const tf of Object.keys(map)) {
		const h = map[tf];
		if (!h?.equity?.length) continue;

		// ── 1. Strip zero-equity rows ──────────────────────────────────────
		const tsOut: number[] = [];
		const eqOut: number[] = [];
		for (let i = 0; i < h.timestamp.length; i++) {
			const eq = h.equity[i];
			if (eq != null && eq > 0) {
				tsOut.push(h.timestamp[i]);
				eqOut.push(eq);
			}
		}
		if (tsOut.length === 0) continue;

		// ── 2. Patch tail with live equity (replace in-place, never append) ──
		if (!isNaN(liveEquity) && liveEquity > 0) {
			eqOut[eqOut.length - 1] = liveEquity;
		}

		// ── 3. Strip cash deposits/withdrawals from each bucket ───────────
		const periodStart = tsOut[0];
		const firstRawEquity = eqOut[0];
		const periodFlows = getPeriodCashFlows(cashFlows, periodStart, firstRawEquity).sort(
			(a, b) => a.time - b.time,
		);
		if (periodFlows.length > 0) {
			let flowIdx = 0;
			let cumFlow = 0;
			for (let i = 0; i < tsOut.length; i++) {
				while (flowIdx < periodFlows.length && periodFlows[flowIdx].time <= tsOut[i]) {
					cumFlow += periodFlows[flowIdx].amount;
					flowIdx++;
				}
				eqOut[i] -= cumFlow;
			}
		}

		// ── 4. Recompute P&L from flow-adjusted equity ────────────────────
		const base = eqOut[0];
		const plOut = eqOut.map((eq) => eq - base);
		const plPctOut = eqOut.map((eq) => (base !== 0 ? (eq - base) / base : 0));

		h.timestamp = tsOut;
		h.equity = eqOut;
		h.profit_loss = plOut;
		h.profit_loss_pct = plPctOut;
		h.base_value = base;
	}
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

		// Fetch non-trading cash flows (deposits/withdrawals/journals) for graph adjustment.
		// CSD = cash deposit, CSW = cash withdrawal, JNLC = journal cash (paper funding).
		const cashFlows: CashFlow[] = [];
		try {
			for (const actType of ["CSD", "CSW", "JNLC"]) {
				const pages = await fetchPaginatedActivities(
					baseUrl,
					headers,
					actType,
					afterDate,
					pageSize,
					2000,
				);
				for (const cf of pages) {
					const dateStr: string = cf.transaction_time ?? cf.date ?? "";
					if (!dateStr) continue;
					const ts = Math.floor(new Date(dateStr).getTime() / 1000);
					const amount = parseFloat(cf.net_amount ?? "0");
					if (!isNaN(ts) && !isNaN(amount) && amount !== 0) {
						cashFlows.push({ time: ts, amount });
					}
				}
			}
			cashFlows.sort((a, b) => a.time - b.time);
			console.log(`[API] ${name}: fetched ${cashFlows.length} cash flow activities`);
		} catch (e) {
			console.error(`[API] Error fetching cash flows for account ${name}:`, e);
		}

		const portfolioHistoryResults = await Promise.all(portfolioHistoryPromises);
		const portfolioHistoryMap: Record<string, PortfolioHistoryData> = Object.fromEntries(
			portfolioHistoryResults
				.filter((r) => r.data !== null)
				.map(({ timeframe, data }) => [timeframe, data])
		);

		// ── Centralised graph normalisation ───────────────────────────────────
		// Live equity from /v2/account is the most up-to-date value available.
		// normalizePortfolioHistory strips zeros, patches the tail of every
		// timeframe with this value, and recomputes P&L/P&L% consistently so
		// all charts and metric cards are in sync.
		const liveEquity = accountInfo ? parseFloat(accountInfo.equity) : NaN;
		normalizePortfolioHistory(portfolioHistoryMap, liveEquity, cashFlows);

		return {
			id,
			name,
			type,
			portfolioHistory: portfolioHistoryMap,
			positions,
			activities: allActivities,
			legToParentOrder,
			orderIdToSource,
			cashFlows,
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
