import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
	Activity,
	AlertTriangle,
	Loader2,
	RefreshCw,
	ChevronDown,
	ChevronRight,
	GitCompare,
	Layers,
	CalendarIcon,
	ShieldCheck,
	ShieldAlert,
} from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "./ui/chart";
import { cn } from "../lib/utils";
import { LogViewer } from "./signals-timeline";
import {
	buildOutcomeSeries,
	buildReasonPairs,
	DEFAULT_DATA_DELAY_MIN,
	mergeMonitorInsights,
	type EvalOutcome,
	type MonitorInsights as AggregateInsights,
	type OutcomeBucket,
	type ReasonPair,
} from "../utils/monitor-aggregate";

type Env = "prod" | "staging";
type Preset = "1d" | "1w" | "1m";

interface StageStats {
	stage: string;
	count: number;
	p50_ns: number | null;
	p99_ns: number | null;
	max_ns: number | null;
}

interface SignalEval {
	kind: string;
	ts: number;
	strategy_name: string;
	client_name: string;
	ticker: string;
	bar_ts: string;
	interval: string;
	live_signal: string;
	live_confidence: number;
	live_reason: string;
	live_frame_has_bar: boolean;
	shadow_signal: string | null;
	shadow_confidence: number | null;
	shadow_reason: string;
	frame_has_bar: boolean;
	shadow_failed: boolean;
	shadow_error: string | null;
	drift: boolean;
	expected_delay_gap?: boolean;
	active_positions: number;
	phase: string;
	data_delay_min?: number;
	freshness_slo_eligible?: boolean;
	spans: Record<string, number | undefined>;
}

interface Heartbeat {
	ts: number;
	queue_lag_ns: number | null;
}

interface DriftAlert {
	ts: number;
	type: string;
	msg: string;
}

interface StrategyInsights {
	strategy_name: string;
	client_name: string;
	evalCount: number;
	shadowCount: number;
	driftCount: number;
	barMissingCount: number;
	shadowFailedCount: number;
	matchRate: number | null;
	barCoverage: number | null;
	shadowSuccessRate: number | null;
	outcomeCounts: Record<EvalOutcome, number>;
	tickers: string[];
	hotPathStats: StageStats[];
	sidecarStats: StageStats[];
	freshnessStats: StageStats[];
	hotPathTotals: StageStats[];
	signalCounts: Record<string, number>;
}

interface LatencyPoint {
	ts: number;
	strategy_name: string;
	ticker: string;
	hot: Record<string, number | undefined>;
	sidecar: Record<string, number | undefined>;
	bar_staleness_ns: number | null;
	bar_staleness_excess_ns?: number | null;
	data_delay_min?: number;
	freshness_slo_eligible?: boolean;
	outcome: EvalOutcome;
	live_reason: string;
	shadow_reason: string;
}

interface MonitorInsights {
	env: Env;
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
	heartbeats: Heartbeat[];
	evaluations: SignalEval[];
	hotPathStats: StageStats[];
	hotPathTotals: StageStats[];
	sidecarStats: StageStats[];
	freshnessStats: StageStats[];
	strategies: StrategyInsights[];
	latencySeries: LatencyPoint[];
	outcomeSeries: OutcomeBucket[];
	reasonPairs: ReasonPair[];
	alerts: DriftAlert[];
	nextBeforeMs?: number | null;
}

function evalHasIssue(e: SignalEval): boolean {
	if (e.expected_delay_gap) return false;
	return (
		e.drift ||
		e.shadow_failed ||
		!e.live_frame_has_bar ||
		!e.frame_has_bar
	);
}

const OUTCOME_STACK_KEYS: EvalOutcome[] = [
	"matched",
	"drift",
	"live_bar_miss",
	"shadow_bar_miss",
	"both_bar_miss",
	"shadow_failed",
	"expected_delay_gap",
	"no_shadow",
];

const OUTCOME_COLORS: Record<EvalOutcome, string> = {
	matched: "#34d399",
	drift: "#f87171",
	live_bar_miss: "#fbbf24",
	shadow_bar_miss: "#fb923c",
	both_bar_miss: "#f59e0b",
	shadow_failed: "#c084fc",
	expected_delay_gap: "#64748b",
	no_shadow: "#52525b",
};

const OUTCOME_LABELS: Record<EvalOutcome, string> = {
	matched: "matched",
	drift: "drift",
	live_bar_miss: "live bar miss",
	shadow_bar_miss: "shadow bar miss",
	both_bar_miss: "both bar miss",
	shadow_failed: "shadow failed",
	expected_delay_gap: "delay gap (pre-RTH)",
	no_shadow: "no shadow",
};

const PRESETS: { key: Preset; label: string; days: number }[] = [
	{ key: "1d", label: "1d", days: 1 },
	{ key: "1w", label: "1w", days: 7 },
	{ key: "1m", label: "1m", days: 30 },
];

/** Tunable SLO thresholds (milliseconds unless noted). */
const SLO = {
	generateSignalsP99Ms: 2000,
	hotPathTotalP99Ms: 3500,
	queueLagP99Ms: 5,
	/** Mirrors the sidecar's MONITOR_STALENESS_SLO_MS budget. */
	barStalenessP99Ms: 10_000,
	/** Expected SIP delay subtracted before staleness SLO (minutes). */
	dataDelayMin: DEFAULT_DATA_DELAY_MIN,
	shadowMatchMin: 0.99,
	barCoverageMin: 0.99,
	shadowSuccessMin: 0.99,
	heartbeatGapMs: 90_000,
} as const;

const HOT_LABELS: Record<string, string> = {
	fetch_data_ns: "fetch_data",
	attach_raw_close_ns: "attach_close",
	indicators_ns: "indicators",
	generate_signals_ns: "generate_signals",
	process_other_ns: "manage+gate",
	run_signals_ns: "run_signals (total)",
	process_ticker_ns: "process_ticker (total)",
};

const HOT_COLORS: Record<string, string> = {
	fetch_data_ns: "#60a5fa",
	attach_raw_close_ns: "#818cf8",
	indicators_ns: "#a78bfa",
	generate_signals_ns: "#34d399",
	process_other_ns: "#fb7185",
};

const HOT_EXCLUSIVE = [
	"fetch_data_ns",
	"attach_raw_close_ns",
	"indicators_ns",
	"generate_signals_ns",
	"process_other_ns",
] as const;

function nsToMs(ns: number | null | undefined): number | null {
	if (ns == null) return null;
	return ns / 1e6;
}

function formatMs(ns: number | null | undefined, digits = 1): string {
	const ms = nsToMs(ns);
	if (ms == null) return "—";
	if (ms < 0.01) return `${(ms * 1000).toFixed(0)} µs`;
	if (ms < 1) return `${ms.toFixed(2)} ms`;
	if (ms < 100) return `${ms.toFixed(digits)} ms`;
	return `${ms.toFixed(0)} ms`;
}

function formatMsValue(ms: number | null | undefined, digits = 1): string {
	if (ms == null || !Number.isFinite(ms)) return "—";
	if (ms < 0.01) return `${(ms * 1000).toFixed(0)} µs`;
	if (ms < 1) return `${ms.toFixed(2)} ms`;
	if (ms < 100) return `${ms.toFixed(digits)} ms`;
	return `${ms.toFixed(0)} ms`;
}

function startOfLocalDay(d = new Date()): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

function endOfLocalDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(23, 59, 59, 999);
	return x;
}

function resolveRange(
	preset: Preset | null,
	range: DateRange | undefined,
): { startMs: number; endMs: number } {
	const now = Date.now();
	if (preset) {
		const days = PRESETS.find((p) => p.key === preset)?.days ?? 1;
		return { startMs: now - days * 86_400_000, endMs: now };
	}
	if (range?.from) {
		const startMs = startOfLocalDay(range.from).getTime();
		const endMs = range.to
			? endOfLocalDay(range.to).getTime()
			: endOfLocalDay(range.from).getTime();
		return { startMs, endMs: Math.min(endMs, now) };
	}
	return { startMs: now - 7 * 86_400_000, endMs: now };
}

function formatAge(ms: number | null): string {
	if (ms == null) return "no heartbeat";
	if (ms < 1000) return `${ms}ms ago`;
	if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
	if (ms < 3600_000) return `${Math.round(ms / 60_000)}m ago`;
	return `${(ms / 3600_000).toFixed(1)}h ago`;
}

function toneClass(tone: "ok" | "warn" | "bad" | "unknown") {
	switch (tone) {
		case "ok":
			return "text-emerald-400";
		case "warn":
			return "text-amber-400";
		case "bad":
			return "text-red-400";
		default:
			return "text-zinc-500";
	}
}

function formatTs(ts: number): string {
	return new Date(ts).toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function truncateReason(s: string, max = 28): string {
	const t = s.trim() || "(none)";
	return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function formatBarOpen(iso: string, interval: string): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const open = d.toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
	return interval ? `${open} · ${interval}` : open;
}

function findStage(stats: StageStats[], stage: string): StageStats | undefined {
	return stats.find((s) => s.stage === stage);
}

interface WaterfallStep {
	stage: string;
	label: string;
	color: string;
	p50Ms: number;
	p99Ms: number;
}

function buildWaterfallSteps(hotPathStats: StageStats[]): WaterfallStep[] {
	return HOT_EXCLUSIVE.map((stage) => {
		const s = findStage(hotPathStats, stage);
		return {
			stage,
			label: HOT_LABELS[stage] ?? stage,
			color: HOT_COLORS[stage] ?? "#71717a",
			p50Ms: nsToMs(s?.p50_ns) ?? 0,
			p99Ms: nsToMs(s?.p99_ns) ?? 0,
		};
	}).filter((s) => s.p50Ms > 0 || s.p99Ms > 0);
}

function HotPathWaterfall({
	steps,
	totals,
}: {
	steps: WaterfallStep[];
	totals: StageStats[];
}) {
	if (steps.length === 0) {
		return (
			<p className="text-xs text-zinc-600 py-10 text-center">No hot-path samples</p>
		);
	}

	const sumP50 = steps.reduce((a, s) => a + s.p50Ms, 0);
	const sumP99 = steps.reduce((a, s) => a + s.p99Ms, 0);
	const maxP99 = Math.max(...steps.map((s) => s.p99Ms), 1);
	const bottleneck = steps.reduce((a, s) => (s.p99Ms > a.p99Ms ? s : a), steps[0]!);

	return (
		<div className="space-y-4">
			<p className="text-[10px] text-zinc-500">
				Each step on its own row (bars scaled to max p99, not stacked) · bottleneck:{" "}
				<span className="text-amber-400 font-medium">{bottleneck.label}</span>{" "}
				<span className="tabular-nums text-zinc-400">
					{formatMsValue(bottleneck.p99Ms)}
				</span>
			</p>

			<div className="space-y-2.5">
				{steps.map((step, i) => {
					const isBottleneck = step.stage === bottleneck.stage;
					const p50Pct = Math.max(0.5, (step.p50Ms / maxP99) * 100);
					const p99Pct = Math.max(0.5, (step.p99Ms / maxP99) * 100);
					const sharePct = sumP99 > 0 ? (step.p99Ms / sumP99) * 100 : 0;
					return (
						<div
							key={step.stage}
							className={cn(
								"rounded-lg border px-3 py-2.5 space-y-1.5",
								isBottleneck
									? "border-amber-700/50 bg-amber-950/15"
									: "border-zinc-800 bg-zinc-950/50",
							)}
						>
							<div className="flex items-baseline justify-between gap-3">
								<div className="flex items-center gap-2 min-w-0">
									<span
										className="w-2 h-2 rounded-sm shrink-0"
										style={{ backgroundColor: step.color }}
									/>
									<span className="text-xs font-medium text-zinc-200 truncate">
										{i + 1}. {step.label}
									</span>
									{isBottleneck && (
										<span className="text-[9px] uppercase tracking-wide text-amber-400 font-semibold shrink-0">
											bottleneck
										</span>
									)}
								</div>
								<div className="flex items-baseline gap-3 shrink-0 text-[11px] tabular-nums">
									<span className="text-zinc-500">
										p50{" "}
										<span className="text-zinc-300 font-medium">
											{formatMsValue(step.p50Ms)}
										</span>
									</span>
									<span className="text-zinc-500">
										p99{" "}
										<span
											className={cn(
												"font-semibold",
												isBottleneck ? "text-amber-300" : "text-zinc-200",
											)}
										>
											{formatMsValue(step.p99Ms)}
										</span>
									</span>
									<span className="text-zinc-600 w-12 text-right">
										{sharePct.toFixed(0)}%
									</span>
								</div>
							</div>
							{/* Dual bars: p99 track (full scale) with p50 overlay */}
							<div className="relative h-2.5 rounded-full bg-zinc-800 overflow-hidden">
								<div
									className="absolute inset-y-0 left-0 rounded-full opacity-35"
									style={{
										width: `${p99Pct}%`,
										backgroundColor: step.color,
									}}
									title={`p99 ${formatMsValue(step.p99Ms)}`}
								/>
								<div
									className="absolute inset-y-0 left-0 rounded-full"
									style={{
										width: `${p50Pct}%`,
										backgroundColor: step.color,
									}}
									title={`p50 ${formatMsValue(step.p50Ms)}`}
								/>
							</div>
						</div>
					);
				})}
			</div>

			<div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500 border-t border-zinc-800 pt-3">
				<span>
					exclusive sum · p50{" "}
					<span className="text-zinc-300 tabular-nums">{formatMsValue(sumP50)}</span> ·
					p99{" "}
					<span className="text-zinc-300 tabular-nums">{formatMsValue(sumP99)}</span>
				</span>
				{totals.map((t) => (
					<span key={t.stage}>
						{HOT_LABELS[t.stage] ?? t.stage}: p50{" "}
						<span className="text-zinc-300 tabular-nums">{formatMs(t.p50_ns)}</span> ·
						p99{" "}
						<span className="text-zinc-300 tabular-nums">{formatMs(t.p99_ns)}</span>
					</span>
				))}
			</div>
			<p className="text-[9px] text-zinc-600">
				Solid bar = p50 · faint extension = p99 · % = share of exclusive p99 sum
			</p>
		</div>
	);
}

interface SloItem {
	id: string;
	group: "runtime" | "parity";
	label: string;
	ok: boolean | null;
	value: string;
	threshold: string;
}

function SloStrip({ items }: { items: SloItem[] }) {
	const breaches = items.filter((item) => item.ok === false);
	const unknown = items.filter((item) => item.ok == null);
	const groups = [
		{
			id: "runtime",
			label: "Runtime",
			grid: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
		},
		{
			id: "parity",
			label: "Parity",
			grid: "grid-cols-1 sm:grid-cols-3",
		},
	] as const;

	return (
		<section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
			<div className="flex items-center justify-between gap-3 mb-4">
				<div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
					<ShieldCheck className="w-3 h-3" />
					SLO status
				</div>
				<p
					className={cn(
						"text-xs font-medium",
						breaches.length > 0
							? "text-red-400"
							: unknown.length === items.length
								? "text-zinc-500"
								: "text-emerald-400",
					)}
				>
					{breaches.length > 0
						? `${breaches.length} breach${breaches.length === 1 ? "" : "es"}`
						: unknown.length === items.length
							? "No SLO samples"
							: "All measured SLOs healthy"}
				</p>
			</div>
			<div className="space-y-4">
				{groups.map((group) => {
					const groupItems = items
						.filter((item) => item.group === group.id)
						.sort((a, b) => Number(a.ok !== false) - Number(b.ok !== false));
					if (groupItems.length === 0) return null;
					return (
						<div key={group.id}>
							<p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-2">
								{group.label}
							</p>
							<div className={cn("grid gap-2.5", group.grid)}>
								{groupItems.map((item) => {
									const tone =
										item.ok == null ? "unknown" : item.ok ? "ok" : ("bad" as const);
									return (
										<div
											key={item.id}
											className={cn(
												"rounded-lg border px-3.5 py-3 min-w-0",
												item.ok === false
													? "border-red-900/50 bg-red-950/20"
													: item.ok === true
														? "border-emerald-900/40 bg-emerald-950/10"
														: "border-zinc-800 bg-zinc-950/40",
											)}
										>
											<div className="flex items-center justify-between gap-2 mb-1.5">
												<span className="text-[11px] text-zinc-400">
													{item.label}
												</span>
												{item.ok == null ? (
													<span className="text-[9px] text-zinc-600 uppercase">
														n/a
													</span>
												) : item.ok ? (
													<ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
												) : (
													<ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
												)}
											</div>
											<p
												className={cn(
													"text-base font-semibold tabular-nums leading-tight",
													toneClass(tone),
												)}
											>
												{item.value}
											</p>
											<p className="text-[10px] text-zinc-600 mt-1 leading-snug">
												{item.threshold}
											</p>
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function StrategyOutcomeStrip({
	counts,
}: {
	counts: Record<EvalOutcome, number>;
}) {
	const total = OUTCOME_STACK_KEYS.reduce((a, k) => a + (counts[k] ?? 0), 0);
	if (total === 0) return null;
	return (
		<div
			className="mt-2 h-1.5 rounded-full overflow-hidden flex bg-zinc-800"
			title={OUTCOME_STACK_KEYS.map(
				(k) => `${OUTCOME_LABELS[k]}: ${counts[k] ?? 0}`,
			).join(" · ")}
		>
			{OUTCOME_STACK_KEYS.map((k) => {
				const n = counts[k] ?? 0;
				if (n === 0) return null;
				return (
					<div
						key={k}
						style={{
							width: `${(n / total) * 100}%`,
							backgroundColor: OUTCOME_COLORS[k],
						}}
					/>
				);
			})}
		</div>
	);
}

export function MonitorDashboard() {
	const [env, setEnv] = useState<Env>("prod");
	const [preset, setPreset] = useState<Preset | null>("1d");
	const [range, setRange] = useState<DateRange | undefined>();
	const [calOpen, setCalOpen] = useState(false);
	const [data, setData] = useState<MonitorInsights | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showRaw, setShowRaw] = useState(false);
	const [tableView, setTableView] = useState<"all" | "issues" | "drifts">("issues");
	const [latencyExpanded, setLatencyExpanded] = useState(false);
	const [strategyFilter, setStrategyFilter] = useState<string>("all");
	const loadGenRef = useRef(0);

	const load = useCallback(async () => {
		const { startMs, endMs } = resolveRange(preset, range);
		if (startMs >= endMs) {
			setError("Invalid date range");
			return;
		}

		const gen = ++loadGenRef.current;
		setIsLoading(true);
		setIsLoadingMore(false);
		setError(null);
		setData(null);

		try {
			// Phase 1: newest day only — paint UI ASAP
			const firstRes = await fetch(
				`/api/monitor?env=${env}&startMs=${startMs}&endMs=${endMs}&beforeMs=${endMs}`,
			);
			if (!firstRes.ok) {
				const j = (await firstRes.json().catch(() => ({}))) as { error?: string };
				throw new Error(j.error ?? `HTTP ${firstRes.status}`);
			}
			const first = (await firstRes.json()) as MonitorInsights;
			if (gen !== loadGenRef.current) return;
			setData(first);
			setIsLoading(false);

			// Phase 2: remaining range in one parallel server fetch, then merge
			const olderEnd = first.nextBeforeMs;
			if (olderEnd != null && olderEnd > startMs) {
				setIsLoadingMore(true);
				const restRes = await fetch(
					`/api/monitor?env=${env}&startMs=${startMs}&endMs=${olderEnd}`,
				);
				if (!restRes.ok) {
					// Keep partial data; surface soft error
					if (gen === loadGenRef.current) {
						setError("Loaded recent day; older range failed to load");
						setIsLoadingMore(false);
					}
					return;
				}
				const older = (await restRes.json()) as MonitorInsights;
				if (gen !== loadGenRef.current) return;
				setData(
					mergeMonitorInsights(
						first as AggregateInsights,
						older as AggregateInsights,
					) as MonitorInsights,
				);
				setIsLoadingMore(false);
			}
		} catch (e) {
			if (gen !== loadGenRef.current) return;
			setError(e instanceof Error ? e.message : "Failed to load monitor");
			setIsLoading(false);
			setIsLoadingMore(false);
		}
	}, [env, preset, range]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		if (!data) return;
		if (
			strategyFilter !== "all" &&
			!data.strategies.some((s) => s.strategy_name === strategyFilter)
		) {
			setStrategyFilter("all");
		}
	}, [data, strategyFilter]);

	const activeStrategy = useMemo(() => {
		if (!data || strategyFilter === "all") return null;
		return data.strategies.find((s) => s.strategy_name === strategyFilter) ?? null;
	}, [data, strategyFilter]);

	const hotPathStats = activeStrategy?.hotPathStats ?? data?.hotPathStats ?? [];
	const hotPathTotals = activeStrategy?.hotPathTotals ?? data?.hotPathTotals ?? [];

	const waterfallSteps = useMemo(
		() => buildWaterfallSteps(hotPathStats),
		[hotPathStats],
	);

	const filteredSeries = useMemo(() => {
		if (!data) return [];
		if (strategyFilter === "all") return data.latencySeries;
		return data.latencySeries.filter((p) => p.strategy_name === strategyFilter);
	}, [data, strategyFilter]);

	const scopedIssueCount = useMemo(() => {
		if (!data) return 0;
		const scoped =
			strategyFilter === "all"
				? data.evaluations
				: data.evaluations.filter((e) => e.strategy_name === strategyFilter);
		return scoped.filter(evalHasIssue).length;
	}, [data, strategyFilter]);

	const effectiveTableView =
		tableView === "issues" && scopedIssueCount === 0 ? "all" : tableView;

	const filteredEvals = useMemo(() => {
		if (!data) return [];
		let list = data.evaluations;
		if (strategyFilter !== "all") {
			list = list.filter((e) => e.strategy_name === strategyFilter);
		}
		if (effectiveTableView === "drifts") list = list.filter((e) => e.drift);
		if (effectiveTableView === "issues") list = list.filter(evalHasIssue);
		return list;
	}, [data, strategyFilter, effectiveTableView]);

	const queueDropAlerts = useMemo(
		() => (data ? data.alerts.filter((a) => a.type === "queue_drops").length : 0),
		[data],
	);

	/** Sidecar-side freshness breaches, independent of the dashboard's own math. */
	const stalenessBreachAlerts = useMemo(
		() =>
			data
				? data.alerts.filter((a) => a.type === "bar_staleness_breach").length
				: 0,
		[data],
	);

	const matchValue = activeStrategy
		? activeStrategy.matchRate
		: data?.summary.matchRate;
	const driftValue = activeStrategy
		? activeStrategy.driftCount
		: data?.summary.driftCount ?? 0;
	const shadowValue = activeStrategy
		? activeStrategy.shadowCount
		: data?.summary.shadowCount ?? 0;
	const barCoverageValue = activeStrategy
		? activeStrategy.barCoverage
		: data?.summary.barCoverage ?? null;
	const shadowSuccessValue = activeStrategy
		? activeStrategy.shadowSuccessRate
		: data?.summary.shadowSuccessRate ?? null;

	const sloItems = useMemo((): SloItem[] => {
		const gen = findStage(hotPathStats, "generate_signals_ns");
		const genP99 = nsToMs(gen?.p99_ns);
		const hotTotalP99 = waterfallSteps.reduce((a, s) => a + s.p99Ms, 0) || null;
		const queueP99 = nsToMs(data?.summary.queueLagP99Ns);
		const staleP99 = nsToMs(
			activeStrategy
				? activeStrategy.freshnessStats[0]?.p99_ns
				: data?.summary.barStalenessP99Ns,
		);
		const match = matchValue;
		const coverage = barCoverageValue;
		const success = shadowSuccessValue;
		const heartbeatAge = data?.summary.lastHeartbeatAgeMs ?? null;

		return [
			{
				id: "heartbeat",
				group: "runtime",
				label: "heartbeat",
				ok: heartbeatAge == null ? null : heartbeatAge <= SLO.heartbeatGapMs,
				value: formatAge(heartbeatAge),
				threshold: `last heartbeat ≤ ${Math.round(SLO.heartbeatGapMs / 1000)}s ago`,
			},
			{
				id: "generate",
				group: "runtime",
				label: "generate p99",
				ok: genP99 == null ? null : genP99 <= SLO.generateSignalsP99Ms,
				value: formatMsValue(genP99),
				threshold: `≤ ${SLO.generateSignalsP99Ms} ms`,
			},
			{
				id: "hot_total",
				group: "runtime",
				label: "hot path p99",
				ok: hotTotalP99 == null || hotTotalP99 === 0
					? null
					: hotTotalP99 <= SLO.hotPathTotalP99Ms,
				value: formatMsValue(hotTotalP99 === 0 ? null : hotTotalP99),
				threshold: `≤ ${SLO.hotPathTotalP99Ms} ms`,
			},
			{
				id: "queue",
				group: "runtime",
				label: "queue lag p99",
				ok:
					queueP99 == null
						? null
						: queueP99 <= SLO.queueLagP99Ms && queueDropAlerts === 0,
				value: formatMsValue(queueP99),
				threshold: `≤ ${SLO.queueLagP99Ms} ms · ${queueDropAlerts} drops`,
			},
			{
				id: "staleness",
				group: "runtime",
				label: "freshness p99",
				ok:
					staleP99 == null
						? null
						: staleP99 <= SLO.barStalenessP99Ms && stalenessBreachAlerts === 0,
				value: formatMsValue(staleP99),
				threshold: `≤ ${SLO.barStalenessP99Ms} ms above ${SLO.dataDelayMin}m feed delay${
					stalenessBreachAlerts > 0 ? ` · ${stalenessBreachAlerts} breaches` : ""
				}`,
			},
			{
				id: "shadow",
				group: "parity",
				label: "shadow match",
				ok: match == null ? null : match >= SLO.shadowMatchMin,
				value: match == null ? "—" : `${(match * 100).toFixed(1)}%`,
				threshold: `≥ ${(SLO.shadowMatchMin * 100).toFixed(0)}%`,
			},
			{
				id: "coverage",
				group: "parity",
				label: "bar coverage",
				ok: coverage == null ? null : coverage >= SLO.barCoverageMin,
				value: coverage == null ? "—" : `${(coverage * 100).toFixed(1)}%`,
				threshold: `≥ ${(SLO.barCoverageMin * 100).toFixed(0)}% both frames`,
			},
			{
				id: "shadow_ok",
				group: "parity",
				label: "shadow success",
				ok: success == null ? null : success >= SLO.shadowSuccessMin,
				value: success == null ? "—" : `${(success * 100).toFixed(1)}%`,
				threshold: `≥ ${(SLO.shadowSuccessMin * 100).toFixed(0)}% no fail`,
			},
		];
	}, [
		hotPathStats,
		waterfallSteps,
		data,
		activeStrategy,
		matchValue,
		barCoverageValue,
		shadowSuccessValue,
		queueDropAlerts,
		stalenessBreachAlerts,
	]);

	/** Outcome stack + match overlay; prefer full latencySeries over table evals. */
	const outcomeChartData = useMemo(() => {
		const series =
			strategyFilter === "all"
				? data?.latencySeries ?? []
				: (data?.latencySeries ?? []).filter(
						(p) => p.strategy_name === strategyFilter,
					);
		const buckets =
			series.length > 0
				? buildOutcomeSeries(series)
				: strategyFilter === "all"
					? data?.outcomeSeries ?? []
					: [];
		return buckets.map((b) => ({
			...b,
			label: formatTs(b.ts),
		}));
	}, [data, strategyFilter]);

	const visibleOutcomeKeys = useMemo(
		() =>
			OUTCOME_STACK_KEYS.filter((key) =>
				outcomeChartData.some((bucket) => (bucket[key] ?? 0) > 0),
			),
		[outcomeChartData],
	);

	const outcomeStackConfig: ChartConfig = useMemo(() => {
		const cfg: ChartConfig = {
			matchPct: { label: "match %", color: "#e4e4e7" },
		};
		for (const k of OUTCOME_STACK_KEYS) {
			cfg[k] = { label: OUTCOME_LABELS[k], color: OUTCOME_COLORS[k] };
		}
		return cfg;
	}, []);

	const reasonChartData = useMemo(() => {
		const series =
			strategyFilter === "all"
				? data?.latencySeries ?? []
				: (data?.latencySeries ?? []).filter(
						(p) => p.strategy_name === strategyFilter,
					);
		const pairs =
			series.length > 0
				? buildReasonPairs(
						series
							.filter((p) => p.outcome === "drift")
							.map((p) => ({
								drift: true,
								live_reason: p.live_reason,
								shadow_reason: p.shadow_reason,
							})),
					)
				: data?.reasonPairs ?? [];
		return pairs.map((p, i) => ({
			id: String(i),
			label: `${truncateReason(p.live_reason)} → ${truncateReason(p.shadow_reason)}`,
			full: `${p.live_reason} → ${p.shadow_reason}`,
			count: p.count,
		}));
	}, [data, strategyFilter]);

	const reasonConfig: ChartConfig = {
		count: { label: "drifts", color: "#f87171" },
	};

	const latencyBreached = sloItems.some(
		(item) =>
			item.group === "runtime" &&
			item.id !== "heartbeat" &&
			item.ok === false,
	);
	const showLatencyDetails = latencyExpanded;
	const bottleneck = waterfallSteps.reduce<WaterfallStep | null>(
		(max, step) => (!max || step.p99Ms > max.p99Ms ? step : max),
		null,
	);

	useEffect(() => {
		if (latencyBreached) setLatencyExpanded(true);
	}, [latencyBreached]);

	const rangeLabel = range?.from
		? range.to
			? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d")}`
			: format(range.from, "MMM d")
		: "Custom";

	return (
		<div className="flex flex-col gap-4">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-2">
				<div className="flex items-center gap-0.5 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
					{(["prod", "staging"] as Env[]).map((e) => (
						<button
							key={e}
							onClick={() => setEnv(e)}
							className={cn(
								"px-3 py-1.5 text-xs rounded-md font-medium transition-all",
								env === e
									? e === "prod"
										? "bg-blue-600 text-white"
										: "bg-amber-500 text-white"
									: "text-zinc-500 hover:text-zinc-300",
							)}
						>
							{e}
						</button>
					))}
				</div>

				<div className="flex gap-1">
					{PRESETS.map(({ key, label }) => (
						<button
							key={key}
							onClick={() => {
								setPreset(key);
								setRange(undefined);
							}}
							className={cn(
								"px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors",
								preset === key
									? "bg-blue-600 text-white"
									: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
							)}
						>
							{label}
						</button>
					))}
				</div>

				<Popover open={calOpen} onOpenChange={setCalOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className={cn(
								"h-8 text-xs gap-1.5",
								!preset && "ring-1 ring-blue-500 border-blue-500",
							)}
						>
							<CalendarIcon className="w-3 h-3" />
							{preset ? "Custom" : rangeLabel}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="start">
						<Calendar
							mode="range"
							selected={range}
							onSelect={(r) => {
								setRange(r);
								setPreset(null);
								if (r?.from && r?.to) setCalOpen(false);
							}}
							toDate={new Date()}
							numberOfMonths={2}
						/>
					</PopoverContent>
				</Popover>

				{data && data.strategies.length > 1 && (
					<select
						value={strategyFilter}
						onChange={(e) => setStrategyFilter(e.target.value)}
						className="h-8 px-2 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[14rem]"
					>
						<option value="all">All strategies</option>
						{data.strategies.map((s) => (
							<option key={s.strategy_name} value={s.strategy_name}>
								{s.strategy_name}
								{s.driftCount > 0 ? ` · ${s.driftCount} drift` : ""}
								{s.barMissingCount > 0
									? ` · ${s.barMissingCount} bar miss`
									: ""}
							</option>
						))}
					</select>
				)}

				<Button
					variant="outline"
					size="sm"
					onClick={load}
					disabled={isLoading}
					className="h-8 px-3"
				>
					{isLoading ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<RefreshCw className="w-3.5 h-3.5" />
					)}
				</Button>

				{data && !isLoading && (
					<span className="text-[10px] text-zinc-600 ml-auto tabular-nums flex items-center gap-1.5">
						{isLoadingMore && (
							<>
								<Loader2 className="w-3 h-3 animate-spin" />
								<span className="text-amber-500/80">loading older…</span>
							</>
						)}
						{data.fetchMs}ms
						{data.truncated && " · truncated"}
						{" · "}
						{data.summary.evalCount} evals · {data.summary.heartbeatCount} beats
					</span>
				)}
			</div>

			{error && (
				<div className="rounded-md border border-red-900/50 bg-red-950/20 px-4 py-3 text-xs text-red-400">
					{error}
				</div>
			)}

			{isLoading && !data ? (
				<div className="flex items-center justify-center h-48 text-zinc-600 gap-2">
					<Loader2 className="w-4 h-4 animate-spin" />
					Loading monitor…
				</div>
			) : data ? (
				<>
					{/* One-glance status: all operational and parity thresholds */}
					<SloStrip items={sloItems} />

					{/* Per-strategy cards */}
					{data.strategies.length > 1 && (
						<section className="space-y-2">
							<h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
								<Layers className="w-3.5 h-3.5" />
								Filter by strategy
							</h3>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
								{data.strategies.map((s) => {
									const selected = strategyFilter === s.strategy_name;
									return (
										<button
											key={s.strategy_name}
											onClick={() =>
												setStrategyFilter(selected ? "all" : s.strategy_name)
											}
											className={cn(
												"text-left rounded-xl border px-4 py-3 transition-colors",
												selected
													? "border-blue-600/60 bg-blue-950/20 ring-1 ring-blue-600/30"
													: "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700",
											)}
										>
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													<p className="text-xs font-semibold text-zinc-100 truncate">
														{s.strategy_name}
													</p>
													<p className="text-[10px] text-zinc-600 truncate">
														{s.client_name || "—"} · {s.tickers.join(", ")}
													</p>
												</div>
												{s.driftCount > 0 ||
												s.barMissingCount > 0 ||
												s.shadowFailedCount > 0 ? (
													<span className="text-[10px] font-medium text-red-400 shrink-0 text-right">
														{[
															s.driftCount > 0 ? `${s.driftCount} drift` : null,
															s.barMissingCount > 0
																? `${s.barMissingCount} bar miss`
																: null,
															s.shadowFailedCount > 0
																? `${s.shadowFailedCount} fail`
																: null,
														]
															.filter(Boolean)
															.join(" · ")}
													</span>
												) : s.shadowCount > 0 ? (
													<span className="text-[10px] text-emerald-500/80 shrink-0">
														matched
													</span>
												) : (
													<span className="text-[10px] text-zinc-600 shrink-0">
														no shadow
													</span>
												)}
											</div>
											{s.outcomeCounts && (
												<StrategyOutcomeStrip counts={s.outcomeCounts} />
											)}
										</button>
									);
								})}
							</div>
						</section>
					)}

					{/* Shadow vs live + drift series */}
					<section className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
						<div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-zinc-800">
							<div className="min-w-0 mr-auto">
								<h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
									<GitCompare className="w-3.5 h-3.5" />
									Shadow parity
								</h3>
								<p className="text-[10px] text-zinc-600 mt-0.5">
									Match compares only rows where both frames resolved the bar
								</p>
							</div>
							<div className="flex items-baseline gap-4 text-right">
								<div>
									<p className="text-lg font-semibold text-zinc-100 tabular-nums">
										{matchValue == null ? "—" : `${(matchValue * 100).toFixed(1)}%`}
									</p>
									<p className="text-[9px] uppercase tracking-wide text-zinc-600">
										match · {shadowValue} compared
									</p>
								</div>
								<div>
									<p
										className={cn(
											"text-lg font-semibold tabular-nums",
											driftValue > 0 ? "text-red-400" : "text-emerald-400",
										)}
									>
										{driftValue}
									</p>
									<p className="text-[9px] uppercase tracking-wide text-zinc-600">
										drifts
									</p>
								</div>
							</div>
							<div className="flex rounded-md border border-zinc-700 bg-zinc-950 p-0.5">
								<span className="px-2 py-1 text-[9px] uppercase tracking-wide text-zinc-600">
									Rows
								</span>
								{(["all", "issues", "drifts"] as const).map((view) => (
									<button
										key={view}
										onClick={() => setTableView(view)}
										className={cn(
											"px-2.5 py-1 text-[10px] rounded transition-colors capitalize",
											effectiveTableView === view
												? "bg-zinc-700 text-zinc-100"
												: "text-zinc-500 hover:text-zinc-300",
										)}
									>
										{view}
									</button>
								))}
							</div>
						</div>

						{outcomeChartData.length > 0 && (
							<div className="px-4 pt-3 pb-2 border-b border-zinc-800 space-y-3">
								<div>
									<p className="text-[10px] text-zinc-500 mb-1 uppercase tracking-widest">
										Outcome mix over time
									</p>
									<p className="text-[9px] text-zinc-600 mb-2">
										Stacked counts · white line = match % on comparable pairs
										only
									</p>
									<ChartContainer
										config={outcomeStackConfig}
										className="h-40 w-full aspect-auto"
									>
									<ComposedChart
											data={outcomeChartData}
											margin={{ left: 8, right: 8, top: 4, bottom: 0 }}
										>
											<CartesianGrid vertical={false} strokeDasharray="3 3" />
											<XAxis
												dataKey="label"
												tickLine={false}
												axisLine={false}
												tick={{ fontSize: 9 }}
												minTickGap={40}
											/>
											<YAxis
												yAxisId="count"
												tickLine={false}
												axisLine={false}
												tick={{ fontSize: 10 }}
												width={32}
												allowDecimals={false}
											/>
											<YAxis
												yAxisId="pct"
												orientation="right"
												domain={[0, 100]}
												tickLine={false}
												axisLine={false}
												tick={{ fontSize: 10 }}
												width={36}
												tickFormatter={(v: number) => `${v}%`}
											/>
											<ChartTooltip content={<ChartTooltipContent />} />
											<Legend
												wrapperStyle={{ fontSize: 10 }}
												iconSize={8}
											/>
										{visibleOutcomeKeys.map((k) => (
											<Bar
													key={k}
													yAxisId="count"
													dataKey={k}
													stackId="out"
													fill={OUTCOME_COLORS[k]}
												/>
											))}
											<Line
												yAxisId="pct"
												type="monotone"
												dataKey="matchPct"
												stroke="var(--color-matchPct)"
												strokeWidth={1.5}
												dot={false}
												connectNulls
											/>
									</ComposedChart>
									</ChartContainer>
								</div>

								{reasonChartData.length > 0 && (
									<div>
										<p className="text-[10px] text-zinc-500 mb-1 uppercase tracking-widest">
											Drift reason pairs
										</p>
										<p className="text-[9px] text-zinc-600 mb-2">
											live_reason → shadow_reason · comparable drifts only
										</p>
										<ChartContainer
											config={reasonConfig}
											className="w-full aspect-auto"
											style={{
												height: Math.max(96, reasonChartData.length * 28),
											}}
										>
											<BarChart
												data={reasonChartData}
												layout="vertical"
												margin={{ left: 4, right: 16, top: 0, bottom: 0 }}
											>
												<CartesianGrid horizontal={false} strokeDasharray="3 3" />
												<XAxis
													type="number"
													tickLine={false}
													axisLine={false}
													tick={{ fontSize: 10 }}
													allowDecimals={false}
												/>
												<YAxis
													type="category"
													dataKey="label"
													width={160}
													tickLine={false}
													axisLine={false}
													tick={{ fontSize: 9 }}
												/>
												<ChartTooltip
													content={
														<ChartTooltipContent
															labelFormatter={(_, payload) => {
																const row = payload?.[0]?.payload as
																	| { full?: string }
																	| undefined;
																return row?.full ?? "";
															}}
														/>
													}
												/>
												<Bar
													dataKey="count"
													fill="var(--color-count)"
													radius={[0, 3, 3, 0]}
												/>
											</BarChart>
										</ChartContainer>
									</div>
								)}
							</div>
						)}

						<div className="overflow-x-auto max-h-[28rem]">
							<table className="w-full text-xs">
								<thead className="sticky top-0 bg-zinc-900 text-[10px] uppercase tracking-widest text-zinc-500">
									<tr className="border-b border-zinc-800">
										<th className="text-left font-medium px-3 py-2">Emitted</th>
										<th className="text-left font-medium px-3 py-2">Strategy</th>
										<th className="text-left font-medium px-3 py-2">Ticker</th>
										<th className="text-left font-medium px-3 py-2">Bar open</th>
										<th className="text-left font-medium px-3 py-2">Live</th>
										<th className="text-left font-medium px-3 py-2">Shadow</th>
										<th className="text-left font-medium px-3 py-2">Status</th>
										<th className="text-left font-medium px-3 py-2">Reasons</th>
									</tr>
								</thead>
								<tbody>
									{filteredEvals.length === 0 ? (
										<tr>
											<td
												colSpan={8}
												className="px-3 py-10 text-center text-zinc-600"
											>
												No{" "}
												{effectiveTableView === "all"
													? ""
													: `${effectiveTableView} `}
												evaluations
											</td>
										</tr>
									) : (
										filteredEvals.map((ev, i) => {
											const status = ev.expected_delay_gap
												? "delay gap"
												: ev.shadow_failed
													? "shadow fail"
													: !ev.live_frame_has_bar && !ev.frame_has_bar
														? "both bars miss"
														: !ev.live_frame_has_bar
															? "live bar miss"
															: !ev.frame_has_bar
																? "shadow bar miss"
																: ev.drift
																	? "drift"
																	: ev.shadow_signal == null
																		? "no shadow"
																		: "ok";
											const reasons = [
												ev.expected_delay_gap
													? "pre-RTH under DATA_DELAY"
													: null,
												ev.live_reason ? `L: ${ev.live_reason}` : null,
												ev.shadow_reason ? `S: ${ev.shadow_reason}` : null,
												ev.shadow_error ? `err: ${ev.shadow_error}` : null,
											]
												.filter(Boolean)
												.join(" · ");
											return (
												<tr
													key={`${ev.ts}-${ev.strategy_name}-${ev.ticker}-${i}`}
													className={cn(
														"border-b border-zinc-800/50 hover:bg-white/[0.02]",
														ev.drift && "bg-red-950/20",
														ev.expected_delay_gap && "bg-zinc-800/40",
														!ev.expected_delay_gap &&
															(ev.shadow_failed ||
																!ev.live_frame_has_bar ||
																!ev.frame_has_bar) &&
															!ev.drift &&
															"bg-amber-950/15",
													)}
												>
													<td className="px-3 py-2 text-zinc-500 tabular-nums whitespace-nowrap">
														{formatTs(ev.ts)}
													</td>
													<td className="px-3 py-2 text-zinc-300 truncate max-w-[9rem]">
														{ev.strategy_name || "—"}
													</td>
													<td className="px-3 py-2 text-zinc-200 font-medium">
														{ev.ticker}
													</td>
													<td className="px-3 py-2 text-zinc-500 whitespace-nowrap">
														{formatBarOpen(ev.bar_ts, ev.interval)}
													</td>
													<td className="px-3 py-2">
														<span
															className={cn(
																"font-semibold",
																!ev.live_frame_has_bar
																	? "text-amber-400"
																	: ev.live_signal === "HOLD"
																		? "text-zinc-500"
																		: "text-emerald-400",
															)}
														>
															{ev.live_signal}
														</span>
														<span className="text-zinc-600 ml-1 tabular-nums">
															{ev.live_confidence.toFixed(2)}
														</span>
													</td>
													<td className="px-3 py-2">
														{ev.shadow_failed ? (
															<span className="text-amber-400 font-semibold">
																failed
															</span>
														) : ev.shadow_signal == null ? (
															<span className="text-zinc-600">—</span>
														) : (
															<>
																<span
																	className={cn(
																		"font-semibold",
																		ev.drift
																			? "text-red-400"
																			: !ev.frame_has_bar
																				? "text-amber-400"
																				: ev.shadow_signal === "HOLD"
																					? "text-zinc-500"
																					: "text-cyan-400",
																	)}
																>
																	{ev.shadow_signal}
																</span>
																{ev.shadow_confidence != null && (
																	<span className="text-zinc-600 ml-1 tabular-nums">
																		{ev.shadow_confidence.toFixed(2)}
																	</span>
																)}
															</>
														)}
													</td>
													<td className="px-3 py-2 whitespace-nowrap">
														<span
															className={cn(
																"text-[10px] font-medium uppercase tracking-wide",
																status === "ok"
																	? "text-emerald-500/80"
																	: status === "drift"
																		? "text-red-400"
																		: status === "no shadow" ||
																			  status === "delay gap"
																			? "text-zinc-500"
																			: "text-amber-400",
															)}
														>
															{status}
														</span>
													</td>
													<td
														className="px-3 py-2 text-zinc-500 max-w-[24rem] whitespace-normal leading-snug"
														title={reasons || undefined}
													>
														{reasons || "—"}
													</td>
												</tr>
											);
										})
									)}
								</tbody>
							</table>
						</div>
					</section>

					{/* Latency is diagnostic detail, expanded automatically only on breach. */}
					<section
						className={cn(
							"rounded-xl border bg-zinc-900/60 overflow-hidden",
							latencyBreached ? "border-red-900/50" : "border-zinc-800",
						)}
					>
						<button
							onClick={() => setLatencyExpanded((value) => !value)}
							className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
						>
							{showLatencyDetails ? (
								<ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
							) : (
								<ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
							)}
							<div className="mr-auto">
								<h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
									<Activity className="w-3.5 h-3.5" />
									Latency diagnostics
								</h3>
								<p className="text-[10px] text-zinc-600 mt-0.5">
									{latencyBreached
										? "A latency SLO breached — inspect the bottleneck"
										: "Collapsed while latency SLOs are healthy"}
								</p>
							</div>
							<div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] tabular-nums">
								<span className="text-zinc-500">
									bottleneck{" "}
									<span className="text-amber-400">
										{bottleneck
											? `${bottleneck.label} ${formatMsValue(bottleneck.p99Ms)}`
											: "—"}
									</span>
								</span>
								<span className="text-zinc-500">
									queue p99{" "}
									<span className="text-zinc-300">
										{formatMs(data.summary.queueLagP99Ns)}
									</span>
								</span>
								<span className="text-zinc-500">
									freshness p99{" "}
									<span className="text-zinc-300">
										{formatMs(
											activeStrategy
												? activeStrategy.freshnessStats[0]?.p99_ns
												: data.summary.barStalenessP99Ns,
										)}
									</span>
								</span>
							</div>
						</button>
						{showLatencyDetails && (
							<div className="border-t border-zinc-800 px-4 py-4">
								<HotPathWaterfall
									steps={waterfallSteps}
									totals={hotPathTotals}
								/>
							</div>
						)}
					</section>

					{data.alerts.length > 0 && (
						<section className="rounded-xl border border-red-900/40 bg-red-950/10 overflow-hidden">
							<div className="px-4 py-3 border-b border-red-900/30">
								<h3 className="text-xs font-semibold text-red-300 uppercase tracking-widest flex items-center gap-1.5">
									<AlertTriangle className="w-3.5 h-3.5" />
									Monitor alerts
								</h3>
							</div>
							<ul className="max-h-48 overflow-y-auto divide-y divide-red-900/20">
								{data.alerts.map((a, i) => (
									<li
										key={`${a.ts}-${a.type}-${i}`}
										className="px-4 py-2 flex gap-3 text-xs"
									>
										<span className="text-zinc-600 tabular-nums shrink-0">
											{formatTs(a.ts)}
										</span>
										<button
											onClick={() => setTableView("issues")}
											className="text-left text-red-400/90 hover:text-red-300 font-medium shrink-0 uppercase text-[10px] tracking-wide w-36"
										>
											{a.type.replace(/_/g, " ")}
										</button>
										<span className="text-zinc-400 break-all font-mono text-[11px]">
											{a.msg}
										</span>
									</li>
								))}
							</ul>
						</section>
					)}
				</>
			) : null}

			<div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
				<button
					onClick={() => setShowRaw((v) => !v)}
					className="w-full flex items-center gap-2 px-4 py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
				>
					{showRaw ? (
						<ChevronDown className="w-3.5 h-3.5" />
					) : (
						<ChevronRight className="w-3.5 h-3.5" />
					)}
					Raw logs
					<span className="text-[10px] text-zinc-700 ml-1">trader + monitor JSONL</span>
				</button>
				{showRaw && (
					<div className="px-3 pb-3 border-t border-zinc-800 pt-3">
						<LogViewer />
					</div>
				)}
			</div>
		</div>
	);
}
