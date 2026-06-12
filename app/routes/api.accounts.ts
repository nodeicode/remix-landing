import type { LoaderFunctionArgs } from "react-router";
import { getConfiguredAccounts, type AccountConfig } from "../utils/alpaca-accounts.server";
import {
	buildPortfolioHistoryUrl,
	fetchCashFlows,
	normalizePortfolioHistoryMap,
	type PortfolioHistoryData,
	type CashFlow,
} from "../utils/portfolio-history.server";

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

interface AccountData {
	id: string;
	name: string;
	type: "LIVE" | "PAPER";
	portfolioHistory: Record<string, PortfolioHistoryData>;
	positions: Position[];
	activities: Activity[];
	legToParentOrder: Record<string, string>;
	orderIdToSource: Record<string, string>;
	cashFlows: CashFlow[];
	buyingPower?: number;
	equity?: number;
}

async function fetchAccountData(config: AccountConfig): Promise<AccountData | null> {
	const { apiKey, secretKey, baseUrl, id, name, type } = config;
	const headers = {
		"APCA-API-KEY-ID": apiKey,
		"APCA-API-SECRET-KEY": secretKey,
	};

	try {
		const accountResponse = await fetch(`${baseUrl}/v2/account`, { headers });
		let accountInfo = null;
		if (accountResponse.ok) {
			accountInfo = await accountResponse.json();
		}

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

			const historyUrl = buildPortfolioHistoryUrl(baseUrl, {
				period,
				timeframe: timeframe === "1D" ? "5Min" : timeframe === "1W" ? "1H" : "1D",
			});

			const response = await fetch(historyUrl, { headers });
			if (!response.ok) return { timeframe, data: null };
			return { timeframe, data: (await response.json()) as PortfolioHistoryData };
		});

		const positionsResponse = await fetch(`${baseUrl}/v2/positions`, { headers });
		const positions: Position[] = positionsResponse.ok ? await positionsResponse.json() : [];

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

		let allActivities: Activity[] = [];
		let pageToken: string | null = null;
		const maxActivities = 10_000;
		const pageSize = 100;
		const twoYearsAgo = new Date();
		twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
		const afterDate = encodeURIComponent(twoYearsAgo.toISOString());

		while (allActivities.length < maxActivities) {
			const activitiesUrl = pageToken
				? `${baseUrl}/v2/account/activities/FILL?page_size=${pageSize}&page_token=${encodeURIComponent(pageToken)}`
				: `${baseUrl}/v2/account/activities/FILL?page_size=${pageSize}&after=${afterDate}`;

			const activitiesResponse: Response = await fetch(activitiesUrl, { headers });
			if (!activitiesResponse.ok) break;

			const pageActivities: Activity[] = await activitiesResponse.json();
			if (pageActivities.length === 0) break;

			allActivities = [...allActivities, ...pageActivities];
			if (pageActivities.length < pageSize) break;

			const oldest = pageActivities[pageActivities.length - 1];
			if (new Date(oldest.transaction_time) < twoYearsAgo) break;
			pageToken = oldest.id;
		}
		console.log(`[API] ${name}: fetched ${allActivities.length} FILL activities`);

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
				const expiryDate = (exp.date as string) ?? (exp.id as string).slice(0, 10);
				const underlying =
					(exp.symbol as string).match(/^([A-Z]+)\d{6}[CP]/)?.[1] ?? exp.symbol;
				const syntheticOrderId = `opexp_${underlying}_${expiryDate}`;
				allActivities.push({
					id: exp.id,
					activity_type: "OPEXP",
					transaction_time: `${expiryDate}T23:59:59Z`,
					type: (exp.type as string) || "expiration",
					price: String(exp.price ?? 0),
					qty: String(Math.abs(parseFloat(exp.qty || "0"))),
					side: "",
					symbol: exp.symbol,
					leaves_qty: "0",
					order_id: syntheticOrderId,
					cum_qty: String(Math.abs(parseFloat(exp.qty || "0"))),
					order_status: "filled",
				});
			}
		} catch (e) {
			console.error(`[API] Error fetching OPEXP for account ${name}:`, e);
		}

		let cashFlows: CashFlow[] = [];
		try {
			cashFlows = await fetchCashFlows(baseUrl, headers, afterDate);
			console.log(`[API] ${name}: fetched ${cashFlows.length} cash flow activities`);
		} catch (e) {
			console.error(`[API] Error fetching cash flows for account ${name}:`, e);
		}

		const portfolioHistoryResults = await Promise.all(portfolioHistoryPromises);
		const portfolioHistoryMap: Record<string, PortfolioHistoryData> = Object.fromEntries(
			portfolioHistoryResults
				.filter((r) => r.data !== null)
				.map(({ timeframe, data }) => [timeframe, data!]),
		);

		const liveEquity = accountInfo ? parseFloat(accountInfo.equity) : NaN;
		normalizePortfolioHistoryMap(portfolioHistoryMap, liveEquity, cashFlows);

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
	const accountsToFetch = getConfiguredAccounts();

	if (accountsToFetch.length === 0) {
		return Response.json({ error: "No Alpaca accounts configured" });
	}

	const results = await Promise.all(accountsToFetch.map(fetchAccountData));
	const accounts = results.filter((a): a is AccountData => a !== null);

	accounts.sort((a, b) => {
		if (a.type === "LIVE" && b.type === "PAPER") return -1;
		if (a.type === "PAPER" && b.type === "LIVE") return 1;
		return 0;
	});

	return Response.json({ accounts });
}
