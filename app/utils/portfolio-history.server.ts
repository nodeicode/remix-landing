export interface PortfolioHistoryData {
	timestamp: number[];
	equity: number[];
	profit_loss: number[];
	profit_loss_pct: number[];
	base_value: number;
	timeframe: string;
	/** Alpaca-reported cumulative cash flows per bucket (when cashflow_types is set). */
	cashflow?: Record<string, number[]>;
}

export interface CashFlow {
	time: number;
	amount: number;
}

const CASHFLOW_TYPES = ["CSD", "CSW", "JNLC"] as const;

/** Pick an Alpaca history resolution suited to the requested span. */
export function pickHistoryTimeframe(startMs: number, endMs: number): string {
	const days = (endMs - startMs) / 86_400_000;
	if (days <= 1) return "5Min";
	if (days <= 7) return "1H";
	return "1D";
}

/** Build a portfolio history URL for preset or custom ranges. */
export function buildPortfolioHistoryUrl(
	baseUrl: string,
	opts: {
		period?: string;
		start?: string;
		end?: string;
		timeframe: string;
	},
): string {
	const params = new URLSearchParams({
		timeframe: opts.timeframe,
		cashflow_types: CASHFLOW_TYPES.join(","),
	});
	if (opts.start && opts.end) {
		params.set("start", opts.start);
		params.set("end", opts.end);
	} else if (opts.period) {
		params.set("period", opts.period);
	}
	return `${baseUrl}/v2/account/portfolio/history?${params}`;
}

/** Sum Alpaca cashflow buckets (CSD + CSW + JNLC) per index. */
function getAlpacaAccumulatedCashflows(
	h: PortfolioHistoryData,
	length: number,
): number[] | null {
	if (!h.cashflow || typeof h.cashflow !== "object") return null;

	const sums = new Array<number>(length).fill(0);
	let hasData = false;

	for (const type of CASHFLOW_TYPES) {
		const arr = h.cashflow[type];
		if (!Array.isArray(arr)) continue;
		for (let i = 0; i < length && i < arr.length; i++) {
			const v = arr[i];
			if (v != null && !isNaN(v)) {
				sums[i] += v;
				if (v !== 0) hasData = true;
			}
		}
	}

	return hasData ? sums : null;
}

/**
 * Manual fallback: subtract in-period deposits/withdrawals from each bucket.
 * Skips initial-funding JNLC that matches opening equity (paper accounts).
 */
function subtractManualCashFlows(
	timestamps: number[],
	equities: number[],
	cashFlows: CashFlow[],
	periodStart: number,
): number[] {
	const inPeriod = cashFlows
		.filter((cf) => cf.time >= periodStart)
		.sort((a, b) => a.time - b.time);

	if (inPeriod.length === 0) return [...equities];

	const firstRawEquity = equities[0];

	// Paper JNLC initial funding often settles after the first equity snapshot but
	// matches opening balance — subtracting it would zero out the baseline.
	const excluded = new Set<number>();
	if (firstRawEquity > 0) {
		const openingFlows = inPeriod.filter((cf) => cf.time <= timestamps[0]);
		const openingNet = openingFlows.reduce((s, cf) => s + cf.amount, 0);
		if (openingFlows.length > 0 && Math.abs(openingNet - firstRawEquity) / firstRawEquity < 0.03) {
			for (const cf of openingFlows) excluded.add(cf.time);
		} else if (
			openingFlows.length === 1 &&
			openingFlows[0].amount > 0 &&
			Math.abs(openingFlows[0].amount - firstRawEquity) / firstRawEquity < 0.03
		) {
			excluded.add(openingFlows[0].time);
		}
	}

	let flowIdx = 0;
	let cumFlow = 0;
	const adjusted: number[] = [];

	for (let i = 0; i < timestamps.length; i++) {
		const ts = timestamps[i];
		while (flowIdx < inPeriod.length && inPeriod[flowIdx].time <= ts) {
			if (!excluded.has(inPeriod[flowIdx].time)) {
				cumFlow += inPeriod[flowIdx].amount;
			}
			flowIdx++;
		}
		adjusted.push(equities[i] - cumFlow);
	}

	return adjusted;
}

/**
 * Centralised post-processing applied to every portfolio history range
 * before the data leaves the server.
 *
 * 1. Strip zero-equity buckets (keeps cashflow arrays aligned).
 * 2. Optionally patch the last point with live equity (current period only).
 * 3. Subtract deposits/withdrawals — prefer Alpaca cashflow field, manual fallback.
 * 4. Recompute profit_loss / profit_loss_pct from flow-adjusted equity.
 */
export function normalizePortfolioHistory(
	data: PortfolioHistoryData,
	liveEquity: number,
	cashFlows: CashFlow[],
	opts?: { patchLive?: boolean },
): PortfolioHistoryData {
	const patchLive = opts?.patchLive ?? true;
	const h = data;
	if (!h?.equity?.length) return h;

	// ── 1. Strip zero-equity rows (align cashflow arrays) ─────────────────
	const tsOut: number[] = [];
	const eqOut: number[] = [];
	const cfAligned: Record<string, number[]> = {};

	if (h.cashflow) {
		for (const type of Object.keys(h.cashflow)) {
			cfAligned[type] = [];
		}
	}

	for (let i = 0; i < h.timestamp.length; i++) {
		const eq = h.equity[i];
		if (eq != null && eq > 0) {
			tsOut.push(h.timestamp[i]);
			eqOut.push(eq);
			if (h.cashflow) {
				for (const type of Object.keys(h.cashflow)) {
					cfAligned[type].push(h.cashflow[type]?.[i] ?? 0);
				}
			}
		}
	}

	if (tsOut.length === 0) return h;

	// ── 2. Patch tail with live equity (replace in-place, never append) ───
	if (patchLive && !isNaN(liveEquity) && liveEquity > 0) {
		eqOut[eqOut.length - 1] = liveEquity;
	}

	// ── 3. Strip cash deposits/withdrawals from each bucket ───────────────
	const scratch: PortfolioHistoryData = {
		...h,
		timestamp: tsOut,
		equity: eqOut,
		cashflow: Object.keys(cfAligned).length > 0 ? cfAligned : h.cashflow,
		profit_loss: [],
		profit_loss_pct: [],
		base_value: 0,
	};

	const alpacaFlows = getAlpacaAccumulatedCashflows(scratch, eqOut.length);
	if (alpacaFlows) {
		for (let i = 0; i < eqOut.length; i++) {
			eqOut[i] -= alpacaFlows[i];
		}
	} else {
		const periodStart = tsOut[0];
		const adjusted = subtractManualCashFlows(tsOut, eqOut, cashFlows, periodStart);
		for (let i = 0; i < eqOut.length; i++) {
			eqOut[i] = adjusted[i];
		}
	}

	// ── 4. Recompute P&L from flow-adjusted equity ──────────────────────────
	const base = eqOut[0];
	const plOut = eqOut.map((eq) => eq - base);
	const plPctOut = eqOut.map((eq) => (base !== 0 ? (eq - base) / base : 0));

	return {
		...h,
		timestamp: tsOut,
		equity: eqOut,
		profit_loss: plOut,
		profit_loss_pct: plPctOut,
		base_value: base,
	};
}

/** Normalize a map of preset timeframes (used by /api/accounts). */
export function normalizePortfolioHistoryMap(
	map: Record<string, PortfolioHistoryData>,
	liveEquity: number,
	cashFlows: CashFlow[],
): void {
	for (const tf of Object.keys(map)) {
		map[tf] = normalizePortfolioHistory(map[tf], liveEquity, cashFlows, {
			patchLive: true,
		});
	}
}

export async function fetchPaginatedActivities(
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

export async function fetchCashFlows(
	baseUrl: string,
	headers: Record<string, string>,
	afterDate: string,
): Promise<CashFlow[]> {
	const cashFlows: CashFlow[] = [];
	const pageSize = 100;

	for (const actType of CASHFLOW_TYPES) {
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
	return cashFlows;
}

export async function fetchPortfolioHistoryForRange(
	baseUrl: string,
	headers: Record<string, string>,
	startMs: number,
	endMs: number,
): Promise<PortfolioHistoryData | null> {
	const timeframe = pickHistoryTimeframe(startMs, endMs);
	const start = new Date(startMs).toISOString();
	const end = new Date(endMs).toISOString();
	const url = buildPortfolioHistoryUrl(baseUrl, { start, end, timeframe });

	const response = await fetch(url, { headers });
	if (!response.ok) return null;
	return (await response.json()) as PortfolioHistoryData;
}
