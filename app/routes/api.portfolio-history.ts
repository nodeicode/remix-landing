import type { LoaderFunctionArgs } from "react-router";
import { findAccountById } from "../utils/alpaca-accounts.server";
import {
	fetchCashFlows,
	fetchPortfolioHistoryForRange,
	normalizePortfolioHistory,
} from "../utils/portfolio-history.server";

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const accountId = url.searchParams.get("accountId");
	const startMs = Number(url.searchParams.get("startMs"));
	const endMs = Number(url.searchParams.get("endMs"));

	if (!accountId) {
		return Response.json({ error: "accountId is required" }, { status: 400 });
	}
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
		return Response.json({ error: "Invalid startMs/endMs" }, { status: 400 });
	}

	const config = findAccountById(accountId);
	if (!config) {
		return Response.json({ error: "Account not found" }, { status: 404 });
	}

	const headers = {
		"APCA-API-KEY-ID": config.apiKey,
		"APCA-API-SECRET-KEY": config.secretKey,
	};

	try {
		const [rawHistory, accountResponse] = await Promise.all([
			fetchPortfolioHistoryForRange(config.baseUrl, headers, startMs, endMs),
			fetch(`${config.baseUrl}/v2/account`, { headers }),
		]);

		if (!rawHistory) {
			return Response.json({ error: "Failed to fetch portfolio history" }, { status: 502 });
		}

		let liveEquity = NaN;
		if (accountResponse.ok) {
			const accountInfo = await accountResponse.json();
			liveEquity = parseFloat(accountInfo.equity);
		}

		// Cash flows for manual fallback when Alpaca cashflow field is absent
		const twoYearsAgo = new Date();
		twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
		const afterDate = encodeURIComponent(twoYearsAgo.toISOString());
		const cashFlows = await fetchCashFlows(config.baseUrl, headers, afterDate);

		const now = Date.now();
		const patchLive = endMs >= now - 86_400_000; // range includes today

		const history = normalizePortfolioHistory(rawHistory, liveEquity, cashFlows, {
			patchLive,
		});

		return Response.json({ history });
	} catch (error) {
		console.error(`[API portfolio-history] Error for ${accountId}:`, error);
		return Response.json({ error: "Internal server error" }, { status: 500 });
	}
}
