/**
 * Pure monitor aggregation (safe for client + server).
 * Parses/aggregates already-fetched events — no CloudWatch I/O.
 */

export type MonitorEnv = "prod" | "staging";

export const HOT_PATH_EXCLUSIVE = [
	"fetch_data_ns",
	"attach_raw_close_ns",
	"indicators_ns",
	"generate_signals_ns",
	"process_other_ns",
] as const;

export const HOT_PATH_TOTALS = ["run_signals_ns", "process_ticker_ns"] as const;
export const SIDECAR_STAGES = ["queue_lag_ns", "shadow_prepare_signals_ns"] as const;
/** What the freshness SLO measures — lag the feed delay does not explain. */
export const FRESHNESS_STAGES = ["bar_staleness_excess_ns"] as const;
/** Raw staleness, kept for context only (dominated by the feed delay). */
export const RAW_FRESHNESS_STAGES = ["bar_staleness_ns"] as const;

/** SIP feed delay baked into live end_dt; staleness SLO uses excess over this. */
export const DEFAULT_DATA_DELAY_MIN = 15;

/** Intervals whose action time is set by a strategy clock, not bar arrival. */
const DAILY_LIKE_INTERVALS = new Set(["1d", "1wk", "1mo"]);

export function dataDelayNs(delayMin: number = DEFAULT_DATA_DELAY_MIN): number {
	return Math.max(0, delayMin) * 60 * 1e9;
}

/**
 * Wall-clock lag past expected DATA_DELAY (never negative).
 *
 * Fallback only — the sidecar stamps `bar_staleness_excess_ns` using the delay
 * actually applied to the tick, which may differ from this env's default.
 */
export function excessBarStalenessNs(
	stalenessNs: number | null | undefined,
	delayMin: number = DEFAULT_DATA_DELAY_MIN,
): number | null {
	if (stalenessNs == null || !Number.isFinite(stalenessNs)) return null;
	return Math.max(0, stalenessNs - dataDelayNs(delayMin));
}

/**
 * Mirror of the sidecar's `is_freshness_sampleable`: only bars whose arrival set
 * the action time belong in the freshness SLO, so "late" means "we were slow".
 *
 * Daily-like intervals (an entry-time-scheduled strategy acts on yesterday's
 * session bar by design) and `expected_delay_gap` stamps are excluded.
 */
export function isFreshnessSampleable(ev: {
	interval: string;
	expected_delay_gap?: boolean;
}): boolean {
	if (ev.expected_delay_gap) return false;
	return !DAILY_LIKE_INTERVALS.has((ev.interval || "").trim().toLowerCase());
}

export type HotPathExclusive = (typeof HOT_PATH_EXCLUSIVE)[number];
export type SidecarStage = (typeof SIDECAR_STAGES)[number];
export type LatencyStage =
	| HotPathExclusive
	| (typeof HOT_PATH_TOTALS)[number]
	| SidecarStage
	| (typeof FRESHNESS_STAGES)[number]
	| (typeof RAW_FRESHNESS_STAGES)[number];

const RAW_SPAN_KEYS = [
	"fetch_data_ns",
	"attach_raw_close_ns",
	"indicators_ns",
	"generate_signals_ns",
	"run_signals_ns",
	"process_ticker_ns",
	"bar_staleness_ns",
	"bar_staleness_excess_ns",
	"shadow_prepare_signals_ns",
	"queue_lag_ns",
] as const;

export interface HeartbeatEvent {
	kind: "heartbeat";
	ts: number;
	queue_lag_ns: number | null;
	emit_wall_ns: number | null;
}

export interface SignalEvalEvent {
	kind: "signal_evaluated" | "shadow_result";
	ts: number;
	strategy_name: string;
	client_name: string;
	ticker: string;
	bar_ts: string;
	end_dt: string;
	interval: string;
	live_signal: string;
	live_confidence: number;
	live_reason: string;
	/** False when live signal cache missed the closed bar (engine). Absent → true. */
	live_frame_has_bar: boolean;
	shadow_signal: string | null;
	shadow_confidence: number | null;
	shadow_reason: string;
	/** False when shadow prepare_signals missed the bar. Absent → true. */
	frame_has_bar: boolean;
	shadow_failed: boolean;
	shadow_error: string | null;
	/** True only when both frames have the bar and live ≠ shadow. */
	drift: boolean;
	/**
	 * Pre-RTH bar stamp under DATA_DELAY (sidecar). Not a real frame miss —
	 * excluded from coverage / live_bar_missing alerts.
	 */
	expected_delay_gap: boolean;
	active_positions: number;
	phase: string;
	/** Minutes from event.DATA_DELAY (sidecar-resolved) or config_snapshot (default 15). */
	data_delay_min: number;
	/**
	 * Sidecar's `freshness_slo_eligible` — false for daily-like intervals and
	 * expected_delay_gap stamps, which are stale by design. Derived when absent.
	 */
	freshness_slo_eligible: boolean;
	spans: Partial<Record<LatencyStage, number>>;
}

export interface DriftAlert {
	ts: number;
	type:
		| "signal_drift"
		| "signal_without_trade"
		| "trade_without_signal"
		| "queue_drops"
		| "live_bar_missing"
		| "shadow_bar_missing"
		| "shadow_failed"
		| "bar_staleness_breach";
	msg: string;
}

export interface StageStats {
	stage: LatencyStage;
	count: number;
	p50_ns: number | null;
	p99_ns: number | null;
	max_ns: number | null;
}

/** Mutually exclusive eval outcome for stacked coverage charts. */
export type EvalOutcome =
	| "matched"
	| "drift"
	| "live_bar_miss"
	| "shadow_bar_miss"
	| "both_bar_miss"
	| "shadow_failed"
	| "expected_delay_gap"
	| "no_shadow";

export const EVAL_OUTCOMES: EvalOutcome[] = [
	"matched",
	"drift",
	"live_bar_miss",
	"shadow_bar_miss",
	"both_bar_miss",
	"shadow_failed",
	"expected_delay_gap",
	"no_shadow",
];

export interface OutcomeBucket {
	ts: number;
	matched: number;
	drift: number;
	live_bar_miss: number;
	shadow_bar_miss: number;
	both_bar_miss: number;
	shadow_failed: number;
	expected_delay_gap: number;
	no_shadow: number;
	/** Match % over comparable (matched+drift) in bucket; null if none */
	matchPct: number | null;
	total: number;
}

export interface ReasonPair {
	live_reason: string;
	shadow_reason: string;
	count: number;
}

export interface StrategyInsights {
	strategy_name: string;
	client_name: string;
	evalCount: number;
	shadowCount: number;
	driftCount: number;
	/** Comparable pairs where either frame missed the bar */
	barMissingCount: number;
	shadowFailedCount: number;
	matchRate: number | null;
	/** Both frames have bar / shadow attempts */
	barCoverage: number | null;
	/** 1 − shadow_failed / shadow attempts */
	shadowSuccessRate: number | null;
	/** Outcome counts for strategy heat strip */
	outcomeCounts: Record<EvalOutcome, number>;
	tickers: string[];
	hotPathStats: StageStats[];
	sidecarStats: StageStats[];
	freshnessStats: StageStats[];
	hotPathTotals: StageStats[];
	signalCounts: Record<string, number>;
}

export interface LatencyPoint {
	ts: number;
	strategy_name: string;
	ticker: string;
	hot: Partial<Record<HotPathExclusive, number>>;
	sidecar: Partial<Record<SidecarStage, number>>;
	bar_staleness_ns: number | null;
	/** Staleness above DATA_DELAY — what the freshness SLO measures */
	bar_staleness_excess_ns: number | null;
	data_delay_min: number;
	/** False for schedule-driven (daily) bars and expected_delay_gap stamps */
	freshness_slo_eligible: boolean;
	outcome: EvalOutcome;
	live_reason: string;
	shadow_reason: string;
}

export interface MonitorInsights {
	env: MonitorEnv;
	startMs: number;
	endMs: number;
	fetchMs: number;
	truncated: boolean;
	summary: {
		lastHeartbeatAgeMs: number | null;
		heartbeatCount: number;
		evalCount: number;
		shadowCount: number;
		driftCount: number;
		barMissingCount: number;
		shadowFailedCount: number;
		matchRate: number | null;
		barCoverage: number | null;
		shadowSuccessRate: number | null;
		shadowAttemptCount: number;
		queueLagP50Ns: number | null;
		queueLagP99Ns: number | null;
		alertCount: number;
		barStalenessP50Ns: number | null;
		barStalenessP99Ns: number | null;
	};
	heartbeats: HeartbeatEvent[];
	evaluations: SignalEvalEvent[];
	hotPathStats: StageStats[];
	hotPathTotals: StageStats[];
	sidecarStats: StageStats[];
	freshnessStats: StageStats[];
	strategies: StrategyInsights[];
	latencySeries: LatencyPoint[];
	/** Time-bucketed outcome stack (from full eval set) */
	outcomeSeries: OutcomeBucket[];
	/** Top live↔shadow reason pairs among drifts */
	reasonPairs: ReasonPair[];
	alerts: DriftAlert[];
	/** When chunked: older bound to request next, or null if done */
	nextBeforeMs?: number | null;
}

function percentile(sorted: number[], p: number): number | null {
	if (sorted.length === 0) return null;
	const idx = Math.min(
		sorted.length - 1,
		Math.max(0, Math.round((p / 100) * (sorted.length - 1))),
	);
	return sorted[idx] ?? null;
}

function isFreshnessStage(stage: LatencyStage): boolean {
	return (FRESHNESS_STAGES as readonly string[]).includes(stage);
}

function computeStageStats(
	evals: SignalEvalEvent[],
	stages: readonly LatencyStage[],
): StageStats[] {
	const buckets: Partial<Record<LatencyStage, number[]>> = {};
	for (const stage of stages) buckets[stage] = [];

	for (const ev of evals) {
		for (const stage of stages) {
			const raw = ev.spans[stage];
			if (typeof raw !== "number") continue;
			// Freshness only counts bars whose arrival gated the action
			if (isFreshnessStage(stage) && !ev.freshness_slo_eligible) continue;
			buckets[stage]!.push(raw);
		}
	}

	return stages
		.map((stage) => {
			const vals = (buckets[stage] ?? []).slice().sort((a, b) => a - b);
			return {
				stage,
				count: vals.length,
				p50_ns: percentile(vals, 50),
				p99_ns: percentile(vals, 99),
				max_ns: vals.length ? vals[vals.length - 1]! : null,
			};
		})
		.filter((s) => s.count > 0);
}

/** Drift only when both live and shadow resolved the closed bar. */
export function computeDrift(ev: {
	live_signal: string;
	shadow_signal: string | null;
	live_frame_has_bar: boolean;
	frame_has_bar: boolean;
	shadow_failed?: boolean;
}): boolean {
	if (ev.shadow_failed) return false;
	if (!ev.live_frame_has_bar || !ev.frame_has_bar) return false;
	if (ev.shadow_signal == null) return false;
	return ev.shadow_signal !== ev.live_signal;
}

export function classifyOutcome(ev: {
	kind?: string;
	live_signal: string;
	shadow_signal: string | null;
	live_frame_has_bar: boolean;
	frame_has_bar: boolean;
	shadow_failed?: boolean;
	expected_delay_gap?: boolean;
	drift?: boolean;
}): EvalOutcome {
	// Sidecar skips missing/shadow for pre-RTH stamps under DATA_DELAY
	if (ev.expected_delay_gap) return "expected_delay_gap";
	if (ev.shadow_failed) return "shadow_failed";
	if (!ev.live_frame_has_bar && !ev.frame_has_bar) return "both_bar_miss";
	if (!ev.live_frame_has_bar) return "live_bar_miss";
	if (!ev.frame_has_bar) return "shadow_bar_miss";
	if (ev.shadow_signal == null) return "no_shadow";
	const drifted =
		ev.drift ??
		computeDrift({
			live_signal: ev.live_signal,
			shadow_signal: ev.shadow_signal,
			live_frame_has_bar: ev.live_frame_has_bar,
			frame_has_bar: ev.frame_has_bar,
			shadow_failed: ev.shadow_failed,
		});
	return drifted ? "drift" : "matched";
}

export function shadowAttempted(ev: {
	kind?: string;
	shadow_signal: string | null;
	shadow_failed?: boolean;
	expected_delay_gap?: boolean;
}): boolean {
	if (ev.expected_delay_gap) return false;
	return (
		Boolean(ev.shadow_failed) ||
		ev.shadow_signal != null ||
		ev.kind === "shadow_result"
	);
}

function emptyOutcomeCounts(): Record<EvalOutcome, number> {
	return {
		matched: 0,
		drift: 0,
		live_bar_miss: 0,
		shadow_bar_miss: 0,
		both_bar_miss: 0,
		shadow_failed: 0,
		expected_delay_gap: 0,
		no_shadow: 0,
	};
}

function coverageRates(evals: SignalEvalEvent[]): {
	barCoverage: number | null;
	shadowSuccessRate: number | null;
	shadowAttemptCount: number;
} {
	const attempts = evals.filter(shadowAttempted);
	if (attempts.length === 0) {
		return { barCoverage: null, shadowSuccessRate: null, shadowAttemptCount: 0 };
	}
	const bothBars = attempts.filter(
		(e) => e.live_frame_has_bar && e.frame_has_bar,
	).length;
	const failed = attempts.filter((e) => e.shadow_failed).length;
	return {
		barCoverage: bothBars / attempts.length,
		shadowSuccessRate: (attempts.length - failed) / attempts.length,
		shadowAttemptCount: attempts.length,
	};
}

export function buildOutcomeSeries(
	points: { ts: number; outcome: EvalOutcome }[],
	bucketCount?: number,
): OutcomeBucket[] {
	const sorted = points.slice().sort((a, b) => a.ts - b.ts);
	if (sorted.length === 0) return [];

	const n = bucketCount ?? Math.min(48, Math.max(8, Math.ceil(sorted.length / 4)));
	const t0 = sorted[0]!.ts;
	const t1 = sorted[sorted.length - 1]!.ts;
	const span = Math.max(1, t1 - t0);
	const buckets: OutcomeBucket[] = Array.from({ length: n }, (_, i) => ({
		ts: t0 + ((i + 0.5) / n) * span,
		matched: 0,
		drift: 0,
		live_bar_miss: 0,
		shadow_bar_miss: 0,
		both_bar_miss: 0,
		shadow_failed: 0,
		expected_delay_gap: 0,
		no_shadow: 0,
		matchPct: null,
		total: 0,
	}));

	for (const pt of sorted) {
		const idx = Math.min(n - 1, Math.floor(((pt.ts - t0) / span) * n));
		const b = buckets[idx]!;
		b[pt.outcome]++;
		b.total++;
	}

	return buckets
		.filter((b) => b.total > 0)
		.map((b) => {
			const comparable = b.matched + b.drift;
			return {
				...b,
				matchPct:
					comparable > 0
						? Number(((b.matched / comparable) * 100).toFixed(1))
						: null,
			};
		});
}

export function buildReasonPairs(
	evals: Pick<
		SignalEvalEvent,
		"drift" | "live_reason" | "shadow_reason"
	>[],
	limit = 12,
): ReasonPair[] {
	const counts = new Map<string, ReasonPair>();
	for (const ev of evals) {
		if (!ev.drift) continue;
		const live = (ev.live_reason || "(none)").trim() || "(none)";
		const shadow = (ev.shadow_reason || "(none)").trim() || "(none)";
		const key = `${live}\0${shadow}`;
		const prev = counts.get(key);
		if (prev) prev.count++;
		else counts.set(key, { live_reason: live, shadow_reason: shadow, count: 1 });
	}
	return Array.from(counts.values())
		.sort((a, b) => b.count - a.count)
		.slice(0, limit);
}

export function dedupeEvaluations(events: SignalEvalEvent[]): SignalEvalEvent[] {
	const map = new Map<string, SignalEvalEvent>();
	for (const ev of events) {
		const key = `${ev.strategy_name}|${ev.ticker}|${ev.bar_ts}|${ev.client_name}`;
		const prev = map.get(key);
		if (!prev) {
			map.set(key, { ...ev, drift: computeDrift(ev) });
			continue;
		}
		const merged: SignalEvalEvent = {
			...prev,
			...ev,
			spans: { ...prev.spans, ...ev.spans },
			live_reason: ev.live_reason || prev.live_reason,
			shadow_reason: ev.shadow_reason || prev.shadow_reason,
			live_frame_has_bar: ev.kind === "shadow_result"
				? (prev.live_frame_has_bar && ev.live_frame_has_bar)
				: ev.live_frame_has_bar,
			frame_has_bar:
				ev.kind === "shadow_result" ? ev.frame_has_bar : prev.frame_has_bar,
			shadow_failed: prev.shadow_failed || ev.shadow_failed,
			shadow_error: ev.shadow_error ?? prev.shadow_error,
			shadow_signal: ev.shadow_signal ?? prev.shadow_signal,
			shadow_confidence: ev.shadow_confidence ?? prev.shadow_confidence,
			live_signal: ev.live_signal || prev.live_signal,
			expected_delay_gap: prev.expected_delay_gap || ev.expected_delay_gap,
			data_delay_min:
				Number.isFinite(ev.data_delay_min) ? ev.data_delay_min : prev.data_delay_min,
			freshness_slo_eligible:
				prev.freshness_slo_eligible && ev.freshness_slo_eligible,
		};
		// Prefer shadow_result kind when merging
		if (ev.kind === "shadow_result" || prev.kind === "shadow_result") {
			merged.kind = "shadow_result";
		}
		merged.drift = computeDrift(merged);
		map.set(key, merged);
	}
	return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
}

function buildStrategyInsights(evaluations: SignalEvalEvent[]): StrategyInsights[] {
	const byStrategy = new Map<string, SignalEvalEvent[]>();
	for (const ev of evaluations) {
		const key = ev.strategy_name || "(unknown)";
		const list = byStrategy.get(key) ?? [];
		list.push(ev);
		byStrategy.set(key, list);
	}

	return Array.from(byStrategy.entries())
		.map(([strategy_name, evals]) => {
			const comparable = evals.filter(isComparableEval);
			const driftCount = comparable.filter((e) => e.drift).length;
			const barMissingCount = evals.filter(
				(e) =>
					!e.expected_delay_gap &&
					(!e.live_frame_has_bar || !e.frame_has_bar),
			).length;
			const shadowFailedCount = evals.filter((e) => e.shadow_failed).length;
			const { barCoverage, shadowSuccessRate } = coverageRates(evals);
			const outcomeCounts = emptyOutcomeCounts();
			for (const e of evals) outcomeCounts[classifyOutcome(e)]++;
			const signalCounts: Record<string, number> = {};
			for (const e of evals) {
				signalCounts[e.live_signal] = (signalCounts[e.live_signal] ?? 0) + 1;
			}
			const tickers = Array.from(new Set(evals.map((e) => e.ticker))).sort();
			const client_name = evals.find((e) => e.client_name)?.client_name ?? "";
			return {
				strategy_name,
				client_name,
				evalCount: evals.length,
				shadowCount: comparable.length,
				driftCount,
				barMissingCount,
				shadowFailedCount,
				matchRate:
					comparable.length > 0
						? (comparable.length - driftCount) / comparable.length
						: null,
				barCoverage,
				shadowSuccessRate,
				outcomeCounts,
				tickers,
				hotPathStats: computeStageStats(evals, HOT_PATH_EXCLUSIVE),
				hotPathTotals: computeStageStats(evals, HOT_PATH_TOTALS),
				sidecarStats: computeStageStats(evals, SIDECAR_STAGES),
				freshnessStats: computeStageStats(evals, FRESHNESS_STAGES),
				signalCounts,
			};
		})
		.sort((a, b) => b.evalCount - a.evalCount);
}

export function buildInsightsFromEvents({
	env,
	startMs,
	endMs,
	fetchMs,
	truncated,
	heartbeats,
	evaluations: rawEvals,
	alerts: rawAlerts,
	nextBeforeMs = null,
	evalTableLimit = 500,
}: {
	env: MonitorEnv;
	startMs: number;
	endMs: number;
	fetchMs: number;
	truncated: boolean;
	heartbeats: HeartbeatEvent[];
	evaluations: SignalEvalEvent[];
	alerts: DriftAlert[];
	nextBeforeMs?: number | null;
	/** Max rows kept for the shadow table (newest first) */
	evalTableLimit?: number;
}): MonitorInsights {
	const evaluations = dedupeEvaluations(rawEvals);
	const alerts = rawAlerts.slice().sort((a, b) => a.ts - b.ts);
	const hbs = heartbeats.slice().sort((a, b) => a.ts - b.ts);

	const lagSamples = hbs
		.map((h) => h.queue_lag_ns)
		.filter((n): n is number => n != null)
		.sort((a, b) => a - b);

	const staleSamples = evaluations
		.filter((e) => e.freshness_slo_eligible)
		.map((e) => e.spans.bar_staleness_excess_ns)
		.filter((n): n is number => typeof n === "number")
		.sort((a, b) => a - b);

	const comparable = evaluations.filter(isComparableEval);
	const driftCount = comparable.filter((e) => e.drift).length;
	const barMissingCount = evaluations.filter(
		(e) =>
			!e.expected_delay_gap &&
			(!e.live_frame_has_bar || !e.frame_has_bar),
	).length;
	const shadowFailedCount = evaluations.filter((e) => e.shadow_failed).length;
	const matchRate =
		comparable.length > 0
			? (comparable.length - driftCount) / comparable.length
			: null;
	const { barCoverage, shadowSuccessRate, shadowAttemptCount } =
		coverageRates(evaluations);

	const lastHb = hbs.length ? hbs[hbs.length - 1]! : null;

	const latencySeries: LatencyPoint[] = evaluations.map((ev) => {
		const hot: Partial<Record<HotPathExclusive, number>> = {};
		for (const s of HOT_PATH_EXCLUSIVE) {
			const v = ev.spans[s];
			if (typeof v === "number") hot[s] = v;
		}
		const sidecar: Partial<Record<SidecarStage, number>> = {};
		for (const s of SIDECAR_STAGES) {
			const v = ev.spans[s];
			if (typeof v === "number") sidecar[s] = v;
		}
		return {
			ts: ev.ts,
			strategy_name: ev.strategy_name,
			ticker: ev.ticker,
			hot,
			sidecar,
			bar_staleness_ns:
				typeof ev.spans.bar_staleness_ns === "number"
					? ev.spans.bar_staleness_ns
					: null,
			bar_staleness_excess_ns:
				typeof ev.spans.bar_staleness_excess_ns === "number"
					? ev.spans.bar_staleness_excess_ns
					: null,
			data_delay_min: ev.data_delay_min,
			freshness_slo_eligible: ev.freshness_slo_eligible,
			outcome: classifyOutcome(ev),
			live_reason: ev.live_reason,
			shadow_reason: ev.shadow_reason,
		};
	});

	return {
		env,
		startMs,
		endMs,
		fetchMs,
		truncated,
		summary: {
			lastHeartbeatAgeMs: lastHb ? endMs - lastHb.ts : null,
			heartbeatCount: hbs.length,
			evalCount: evaluations.length,
			shadowCount: comparable.length,
			driftCount,
			barMissingCount,
			shadowFailedCount,
			matchRate,
			barCoverage,
			shadowSuccessRate,
			shadowAttemptCount,
			queueLagP50Ns: percentile(lagSamples, 50),
			queueLagP99Ns: percentile(lagSamples, 99),
			alertCount: alerts.length,
			barStalenessP50Ns: percentile(staleSamples, 50),
			barStalenessP99Ns: percentile(staleSamples, 99),
		},
		heartbeats: hbs,
		evaluations: evaluations.slice(-evalTableLimit).reverse(),
		hotPathStats: computeStageStats(evaluations, HOT_PATH_EXCLUSIVE),
		hotPathTotals: computeStageStats(evaluations, HOT_PATH_TOTALS),
		sidecarStats: computeStageStats(evaluations, SIDECAR_STAGES),
		freshnessStats: computeStageStats(evaluations, FRESHNESS_STAGES),
		strategies: buildStrategyInsights(evaluations),
		latencySeries,
		outcomeSeries: buildOutcomeSeries(latencySeries),
		reasonPairs: buildReasonPairs(evaluations),
		alerts: alerts.slice(-200).reverse(),
		nextBeforeMs,
	};
}

/** Merge progressive chunks (older + newer) into one insights payload. */
export function mergeMonitorInsights(
	newer: MonitorInsights,
	older: MonitorInsights,
): MonitorInsights {
	// Table rows are newest-first; reverse back to chronological for dedupe
	const evals = [
		...older.evaluations.slice().reverse(),
		...newer.evaluations.slice().reverse(),
	];
	const alerts = [...older.alerts.slice().reverse(), ...newer.alerts.slice().reverse()];
	const heartbeats = [...older.heartbeats, ...newer.heartbeats];

	const merged = buildInsightsFromEvents({
		env: newer.env,
		startMs: Math.min(older.startMs, newer.startMs),
		endMs: Math.max(older.endMs, newer.endMs),
		fetchMs: older.fetchMs + newer.fetchMs,
		truncated: older.truncated || newer.truncated,
		heartbeats,
		evaluations: evals,
		alerts,
		nextBeforeMs: older.nextBeforeMs ?? null,
		evalTableLimit: 500,
	});

	// Preserve full per-chunk latency/outcome series (table evals are capped at 500)
	const latencySeries = [...older.latencySeries, ...newer.latencySeries].sort(
		(a, b) => a.ts - b.ts,
	);
	merged.latencySeries = latencySeries;
	merged.outcomeSeries = buildOutcomeSeries(latencySeries);

	// Freshness from the full series, not just the capped table evals
	const excessSamples = latencySeries
		.filter((p) => p.freshness_slo_eligible)
		.map((p) => p.bar_staleness_excess_ns)
		.filter((n): n is number => typeof n === "number")
		.sort((a, b) => a - b);
	if (excessSamples.length > 0) {
		merged.summary.barStalenessP50Ns = percentile(excessSamples, 50);
		merged.summary.barStalenessP99Ns = percentile(excessSamples, 99);
	}

	const driftReasonPoints = latencySeries
		.filter((p) => p.outcome === "drift")
		.map((p) => ({
			drift: true as const,
			live_reason: p.live_reason,
			shadow_reason: p.shadow_reason,
		}));
	merged.reasonPairs = buildReasonPairs(driftReasonPoints);

	// Recompute coverage rates from full series (table evals are capped)
	const attemptOutcomes = latencySeries.filter(
		(p) => p.outcome !== "no_shadow" && p.outcome !== "expected_delay_gap",
	);
	if (attemptOutcomes.length > 0) {
		const barMiss = attemptOutcomes.filter((p) =>
			["live_bar_miss", "shadow_bar_miss", "both_bar_miss"].includes(p.outcome),
		).length;
		const failed = attemptOutcomes.filter((p) => p.outcome === "shadow_failed")
			.length;
		const comparable = latencySeries.filter(
			(p) => p.outcome === "matched" || p.outcome === "drift",
		).length;
		merged.summary.shadowAttemptCount = attemptOutcomes.length;
		merged.summary.barCoverage =
			(attemptOutcomes.length - barMiss) / attemptOutcomes.length;
		merged.summary.shadowSuccessRate =
			(attemptOutcomes.length - failed) / attemptOutcomes.length;
		merged.summary.evalCount = latencySeries.length;
		merged.summary.driftCount = latencySeries.filter(
			(p) => p.outcome === "drift",
		).length;
		merged.summary.barMissingCount = latencySeries.filter((p) =>
			["live_bar_miss", "shadow_bar_miss", "both_bar_miss"].includes(p.outcome),
		).length;
		merged.summary.shadowFailedCount = failed;
		merged.summary.shadowCount = comparable;
		merged.summary.matchRate =
			comparable > 0
				? latencySeries.filter((p) => p.outcome === "matched").length / comparable
				: null;
	}

	return merged;
}

// ── JSONL parse helpers (used by server) ──────────────────────────────────

function asInt(v: unknown): number | null {
	if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
	if (typeof v === "string" && v.trim() !== "") {
		const n = Number(v);
		return Number.isFinite(n) ? Math.trunc(n) : null;
	}
	return null;
}

function asStr(v: unknown, fallback = ""): string {
	return typeof v === "string" ? v : fallback;
}

function asNum(v: unknown, fallback = 0): number {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim() !== "") {
		const n = Number(v);
		return Number.isFinite(n) ? n : fallback;
	}
	return fallback;
}

function normalizeSpans(
	raw: Partial<Record<string, number>>,
): Partial<Record<LatencyStage, number>> {
	const spans: Partial<Record<LatencyStage, number>> = {};
	for (const key of RAW_SPAN_KEYS) {
		const v = raw[key];
		if (typeof v === "number") spans[key] = v;
	}
	const process = spans.process_ticker_ns;
	const run = spans.run_signals_ns;
	if (typeof process === "number") {
		spans.process_other_ns = Math.max(0, process - (typeof run === "number" ? run : 0));
	}
	return spans;
}

function extractRawSpans(
	raw: Record<string, unknown>,
): Partial<Record<(typeof RAW_SPAN_KEYS)[number], number>> {
	const spans: Partial<Record<(typeof RAW_SPAN_KEYS)[number], number>> = {};
	for (const stage of RAW_SPAN_KEYS) {
		const n = asInt(raw[stage]);
		if (n != null) spans[stage] = n;
	}
	return spans;
}

export function parseMonitorJsonLine(
	ts: number,
	msg: string,
): HeartbeatEvent | SignalEvalEvent | null {
	const trimmed = msg.trim();
	if (!trimmed.startsWith("{")) return null;
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return null;
	}
	const kind = asStr(raw.kind);
	if (kind === "heartbeat") {
		return {
			kind: "heartbeat",
			ts,
			queue_lag_ns: asInt(raw.queue_lag_ns),
			emit_wall_ns: asInt(raw.emit_wall_ns),
		};
	}
	if (kind === "signal_evaluated" || kind === "shadow_result") {
		const live = asStr(raw.live_signal, "HOLD").toUpperCase();
		const shadowRaw = raw.shadow_signal;
		const shadow =
			shadowRaw == null || shadowRaw === ""
				? null
				: asStr(shadowRaw).toUpperCase();
		// Absent key → true (backward compat with older emit payloads)
		const liveFrameHasBar =
			raw.live_frame_has_bar === undefined ? true : Boolean(raw.live_frame_has_bar);
		const frameHasBar =
			raw.frame_has_bar === undefined ? true : Boolean(raw.frame_has_bar);
		const shadowFailed = Boolean(raw.shadow_failed);
		const snap =
			raw.config_snapshot && typeof raw.config_snapshot === "object"
				? (raw.config_snapshot as Record<string, unknown>)
				: null;
		const delayFromSnap = snap ? asInt(snap.DATA_DELAY) : null;
		// Sidecar stamps the delay it actually applied to this tick; it wins over
		// the engine's config snapshot, which may not match this strategy.
		const delayFromEvent = asInt(raw.DATA_DELAY);
		const delayMin =
			delayFromEvent != null
				? delayFromEvent
				: delayFromSnap != null
					? delayFromSnap
					: DEFAULT_DATA_DELAY_MIN;
		const spans = normalizeSpans(extractRawSpans(raw));
		if (spans.bar_staleness_excess_ns == null) {
			const excess = excessBarStalenessNs(spans.bar_staleness_ns, delayMin);
			if (excess != null) spans.bar_staleness_excess_ns = excess;
		}
		const interval = asStr(raw.interval);
		const expectedDelayGap = Boolean(raw.expected_delay_gap);
		const ev: SignalEvalEvent = {
			kind,
			ts,
			strategy_name: asStr(raw.strategy_name),
			client_name: asStr(raw.client_name),
			ticker: asStr(raw.ticker).toUpperCase(),
			bar_ts: asStr(raw.bar_ts),
			end_dt: asStr(raw.end_dt),
			interval,
			live_signal: live,
			live_confidence: asNum(raw.live_confidence),
			live_reason: asStr(raw.live_reason),
			live_frame_has_bar: liveFrameHasBar,
			shadow_signal: shadow,
			shadow_confidence:
				raw.shadow_confidence == null ? null : asNum(raw.shadow_confidence),
			shadow_reason: asStr(raw.shadow_reason),
			frame_has_bar: frameHasBar,
			shadow_failed: shadowFailed,
			shadow_error: raw.shadow_error == null ? null : asStr(raw.shadow_error),
			drift: false,
			expected_delay_gap: expectedDelayGap,
			active_positions: asInt(raw.active_positions) ?? 0,
			phase: asStr(raw.phase),
			data_delay_min: delayMin,
			freshness_slo_eligible:
				raw.freshness_slo_eligible === undefined
					? isFreshnessSampleable({
							interval,
							expected_delay_gap: expectedDelayGap,
						})
					: Boolean(raw.freshness_slo_eligible),
			spans,
		};
		ev.drift = computeDrift(ev);
		return ev;
	}
	return null;
}

const ALERT_PATTERNS: { type: DriftAlert["type"]; re: RegExp }[] = [
	{ type: "signal_drift", re: /\[MONITOR\]\s+signal_drift\b/i },
	{ type: "signal_without_trade", re: /\[MONITOR\]\s+signal_without_trade\b/i },
	{ type: "trade_without_signal", re: /\[MONITOR\]\s+trade_without_signal\b/i },
	{ type: "queue_drops", re: /\[MONITOR\]\[LATENCY\].*drops=\s*[1-9]/i },
	{ type: "live_bar_missing", re: /\[MONITOR\]\s+live_bar_missing\b/i },
	{ type: "shadow_bar_missing", re: /\[MONITOR\]\s+shadow_bar_missing\b/i },
	{
		type: "shadow_failed",
		re: /\[MONITOR\].*shadow_backtest_signal failed/i,
	},
	{ type: "bar_staleness_breach", re: /\[MONITOR\]\s+bar_staleness_breach\b/i },
];

/** Both frames resolved the bar and shadow ran — eligible for match/drift rate. */
export function isComparableEval(e: {
	shadow_signal: string | null;
	shadow_failed?: boolean;
	live_frame_has_bar: boolean;
	frame_has_bar: boolean;
	expected_delay_gap?: boolean;
}): boolean {
	if (e.expected_delay_gap) return false;
	return (
		e.shadow_signal != null &&
		!e.shadow_failed &&
		e.live_frame_has_bar &&
		e.frame_has_bar
	);
}

export function parseTraderAlertLine(ts: number, msg: string): DriftAlert | null {
	for (const { type, re } of ALERT_PATTERNS) {
		if (re.test(msg)) {
			return { ts, type, msg: msg.trim() };
		}
	}
	return null;
}
