import { CHUNK_MS, fetchLogsParallel } from "~/utils/cloudwatch.server";
import {
	buildInsightsFromEvents,
	dedupeEvaluations,
	dedupeManageEvaluations,
	parseMonitorJsonLine,
	parseTraderAlertLine,
	type DriftAlert,
	type HeartbeatEvent,
	type MonitorEnv,
	type MonitorInsights,
	type ManageEvalEvent,
	type SignalEvalEvent,
} from "~/utils/monitor-aggregate";

export type {
	MonitorEnv,
	MonitorInsights,
	HeartbeatEvent,
	SignalEvalEvent,
	ManageEvalEvent,
	ManageExitClass,
	ManageSummary,
	ManageStrategyInsights,
	DriftAlert,
	StageStats,
	StrategyInsights,
	HotPathExclusive,
	SidecarStage,
	LatencyStage,
} from "~/utils/monitor-aggregate";

export {
	HOT_PATH_EXCLUSIVE,
	HOT_PATH_TOTALS,
	SIDECAR_STAGES,
	FRESHNESS_STAGES,
	mergeMonitorInsights,
	buildInsightsFromEvents,
} from "~/utils/monitor-aggregate";

function alertAlreadyLogged(
	msgs: string[],
	ev: Pick<SignalEvalEvent, "ticker" | "bar_ts" | "strategy_name">,
): boolean {
	return msgs.some(
		(m) =>
			m.includes(ev.ticker) &&
			m.includes(ev.bar_ts) &&
			m.includes(ev.strategy_name),
	);
}

/** Synthesize alerts from eval fields when trader log lines were missed. */
function enrichAlertsFromEvals(
	alerts: DriftAlert[],
	evaluations: SignalEvalEvent[],
): DriftAlert[] {
	const byType = (type: DriftAlert["type"]) =>
		alerts.filter((a) => a.type === type).map((a) => a.msg);

	const driftMsgs = byType("signal_drift");
	const liveMissingMsgs = byType("live_bar_missing");
	const shadowMissingMsgs = byType("shadow_bar_missing");
	const shadowFailedMsgs = byType("shadow_failed");

	const out = alerts.slice();

	for (const ev of evaluations) {
		if (ev.drift) {
			const msg = `signal_drift strategy=${ev.strategy_name} ticker=${ev.ticker} bar_ts=${ev.bar_ts} live=${ev.live_signal} shadow=${ev.shadow_signal} live_reason=${ev.live_reason} shadow_reason=${ev.shadow_reason}`;
			if (!alertAlreadyLogged(driftMsgs, ev)) {
				out.push({ ts: ev.ts, type: "signal_drift", msg });
				driftMsgs.push(msg);
			}
		}
		if (!ev.live_frame_has_bar && !ev.expected_delay_gap) {
			const msg = `live_bar_missing strategy=${ev.strategy_name} ticker=${ev.ticker} bar_ts=${ev.bar_ts} live=${ev.live_signal}`;
			if (!alertAlreadyLogged(liveMissingMsgs, ev)) {
				out.push({ ts: ev.ts, type: "live_bar_missing", msg });
				liveMissingMsgs.push(msg);
			}
		}
		if (
			!ev.frame_has_bar &&
			!ev.expected_delay_gap &&
			(ev.kind === "shadow_result" || ev.shadow_signal != null)
		) {
			const msg = `shadow_bar_missing strategy=${ev.strategy_name} ticker=${ev.ticker} bar_ts=${ev.bar_ts} shadow=${ev.shadow_signal ?? ""}`;
			if (!alertAlreadyLogged(shadowMissingMsgs, ev)) {
				out.push({ ts: ev.ts, type: "shadow_bar_missing", msg });
				shadowMissingMsgs.push(msg);
			}
		}
		if (ev.shadow_failed) {
			const msg = `shadow_failed strategy=${ev.strategy_name} ticker=${ev.ticker} bar_ts=${ev.bar_ts} error=${ev.shadow_error ?? ""}`;
			if (!alertAlreadyLogged(shadowFailedMsgs, ev)) {
				out.push({ ts: ev.ts, type: "shadow_failed", msg });
				shadowFailedMsgs.push(msg);
			}
		}
	}

	return out;
}

function enrichManageAlerts(
	alerts: DriftAlert[],
	evaluations: ManageEvalEvent[],
): DriftAlert[] {
	const out = alerts.slice();
	const driftMsgs = out.filter((a) => a.type === "manage_exit_drift").map((a) => a.msg);
	const failedMsgs = out.filter((a) => a.type === "shadow_manage_failed").map((a) => a.msg);
	for (const ev of evaluations) {
		const identity = `strategy=${ev.strategy_name} ticker=${ev.ticker} entry=${ev.entry_time}`;
		if (ev.drift && !driftMsgs.some((msg) => msg.includes(identity))) {
			const msg = `manage_exit_drift ${identity} live=${ev.live_exit}/${ev.exit_bar ?? ""} shadow=${ev.shadow_exit}/${ev.shadow_exit_bar ?? ""}`;
			out.push({ ts: ev.ts, type: "manage_exit_drift", msg });
			driftMsgs.push(msg);
		}
		if (ev.shadow_failed && !failedMsgs.some((msg) => msg.includes(identity))) {
			const msg = `shadow_manage_failed ${identity} error=${ev.shadow_error ?? ""}`;
			out.push({ ts: ev.ts, type: "shadow_manage_failed", msg });
			failedMsgs.push(msg);
		}
	}
	return out;
}

/**
 * Fetch + aggregate monitor insights.
 *
 * Uses parallel day-chunk CloudWatch reads (no binary-narrow truncation).
 * When `beforeMs` is set, only the newest day ending at beforeMs is fetched
 * and `nextBeforeMs` points at the previous day for progressive loading.
 */
export async function fetchMonitorInsights({
	env,
	startMs,
	endMs,
	beforeMs,
}: {
	env: MonitorEnv;
	startMs: number;
	endMs: number;
	/** Optional progressive cursor: fetch only [max(start, before-1d), before] */
	beforeMs?: number;
}): Promise<MonitorInsights> {
	const t0 = Date.now();
	const rangeEnd = beforeMs != null ? Math.min(beforeMs, endMs) : endMs;
	const rangeStart =
		beforeMs != null ? Math.max(startMs, rangeEnd - CHUNK_MS) : startMs;

	const [monitorRes, traderRes] = await Promise.all([
		fetchLogsParallel({
			envs: [env],
			startMs: rangeStart,
			endMs: rangeEnd,
			groups: ["monitor"],
		}),
		fetchLogsParallel({
			envs: [env],
			startMs: rangeStart,
			endMs: rangeEnd,
			groups: ["trader"],
			filterPattern: "MONITOR",
		}),
	]);

	const heartbeats: HeartbeatEvent[] = [];
	const rawEvals: SignalEvalEvent[] = [];
	const rawManageEvals: ManageEvalEvent[] = [];

	for (const line of monitorRes.lines) {
		const ev = parseMonitorJsonLine(line.ts, line.msg);
		if (!ev) continue;
		if (ev.kind === "heartbeat") heartbeats.push(ev);
		else if (ev.kind === "manage_evaluated" || ev.kind === "shadow_manage_result") {
			rawManageEvals.push(ev);
		} else if (ev.kind === "signal_evaluated" || ev.kind === "shadow_result") {
			rawEvals.push(ev);
		}
	}

	const alerts: DriftAlert[] = [];
	for (const line of traderRes.lines) {
		const a = parseTraderAlertLine(line.ts, line.msg);
		if (a) alerts.push(a);
	}

	const evaluations = dedupeEvaluations(rawEvals);
	const manageEvaluations = dedupeManageEvaluations(rawManageEvals);
	const enrichedAlerts = enrichManageAlerts(
		enrichAlertsFromEvals(alerts, evaluations),
		manageEvaluations,
	);

	const nextBeforeMs = rangeStart > startMs ? rangeStart : null;

	return buildInsightsFromEvents({
		env,
		startMs: rangeStart,
		endMs: rangeEnd,
		fetchMs: Date.now() - t0,
		truncated: monitorRes.truncated || traderRes.truncated,
		heartbeats,
		evaluations,
		manageEvaluations,
		alerts: enrichedAlerts,
		nextBeforeMs,
	});
}
