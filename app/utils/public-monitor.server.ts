import { fetchMonitorInsights } from "~/utils/monitor.server";
import type { MonitorInsights, StageStats } from "~/utils/monitor-aggregate";
import type { PublicMetric, PublicMonitorSummary, PublicMonitorWindow } from "~/utils/public-monitor";

const PUBLIC_STAGES = ["fetch_data_ns", "attach_raw_close_ns", "indicators_ns", "generate_signals_ns", "process_other_ns"] as const;

function metric(stat: StageStats | undefined): PublicMetric | null {
	if (!stat) return null;
	return { count: stat.count, p50Ns: stat.p50_ns, p99Ns: stat.p99_ns, maxNs: stat.max_ns };
}

function p99(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = values.slice().sort((a, b) => a - b);
	return sorted[Math.round((sorted.length - 1) * 0.99)] ?? null;
}

function trend(insights: MonitorInsights): PublicMonitorWindow["trend"] {
	const buckets = new Map<number, number[]>();
	for (const point of insights.latencySeries) {
		const total = Object.values(point.hot).reduce((sum, value) => sum + (value ?? 0), 0);
		if (!total) continue;
		const hour = Math.floor(point.ts / 3_600_000) * 3_600_000;
		const values = buckets.get(hour) ?? [];
		values.push(total);
		buckets.set(hour, values);
	}
	return Array.from(buckets, ([ts, values]) => ({ ts, processingP99Ns: p99(values) })).sort((a, b) => a.ts - b.ts).slice(-48);
}

function project(insights: MonitorInsights): PublicMonitorWindow {
	const stageMap = new Map(insights.hotPathStats.map((item) => [item.stage, item]));
	const stages: Record<string, PublicMetric> = {};
	for (const stage of PUBLIC_STAGES) {
		const value = metric(stageMap.get(stage));
		if (value) stages[stage] = value;
	}
	return {
		startMs: insights.startMs,
		endMs: insights.endMs,
		eventCount: insights.summary.evalCount,
		heartbeatAgeMs: insights.summary.lastHeartbeatAgeMs,
		shadowMatchRate: insights.summary.matchRate,
		barCoverageRate: insights.summary.barCoverage,
		shadowSuccessRate: insights.summary.shadowSuccessRate,
		processing: metric(insights.hotPathTotals.find((item) => item.stage === "process_ticker_ns")),
		stages,
		queueLag: { count: insights.summary.heartbeatCount, p50Ns: insights.summary.queueLagP50Ns, p99Ns: insights.summary.queueLagP99Ns, maxNs: null },
		freshness: { count: insights.summary.evalCount, p50Ns: insights.summary.barStalenessP50Ns, p99Ns: insights.summary.barStalenessP99Ns, maxNs: null },
		trend: trend(insights),
	};
}

/** Fixed production windows only; the projection drops operational identities and raw events. */
export async function fetchPublicMonitorSummary(): Promise<PublicMonitorSummary> {
	const asOfMs = Date.now();
	const [day, week] = await Promise.all([
		fetchMonitorInsights({ env: "staging", startMs: asOfMs - 86_400_000, endMs: asOfMs }),
		fetchMonitorInsights({ env: "staging", startMs: asOfMs - 7 * 86_400_000, endMs: asOfMs }),
	]);
	return { asOfMs, windows: { day: project(day), week: project(week) } };
}
