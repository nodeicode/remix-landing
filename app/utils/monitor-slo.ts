import type { PublicMonitorWindow } from "~/utils/public-monitor";
import { DEFAULT_DATA_DELAY_MIN } from "~/utils/monitor-aggregate";

/** Shared performance budgets used by the private dashboard and public card. */
export const MONITOR_SLO = {
	generateSignalsP99Ms: 2_000,
	hotPathTotalP99Ms: 3_500,
	queueLagP99Ms: 5,
	barStalenessP99Ms: 10_000,
	dataDelayMin: DEFAULT_DATA_DELAY_MIN,
	shadowMatchMin: 0.99,
	barCoverageMin: 0.99,
	shadowSuccessMin: 0.99,
	heartbeatGapMs: 90_000,
} as const;

export type PublicSloScore = { passing: number; observed: number; total: number };

/**
 * Scores only aggregates exposed in the public contract. A missing measurement
 * is not a failed budget, but remains visible through the observed count.
 */
export function scorePublicSlo(window: PublicMonitorWindow | null): PublicSloScore {
	const checks = [
		window?.processing?.p99Ns == null ? null : window.processing.p99Ns <= MONITOR_SLO.hotPathTotalP99Ms * 1e6,
		window?.queueLag.p99Ns == null ? null : window.queueLag.p99Ns <= MONITOR_SLO.queueLagP99Ms * 1e6,
		window?.freshness.p99Ns == null ? null : window.freshness.p99Ns <= MONITOR_SLO.barStalenessP99Ms * 1e6,
		window?.shadowMatchRate == null ? null : window.shadowMatchRate >= MONITOR_SLO.shadowMatchMin,
		window?.barCoverageRate == null ? null : window.barCoverageRate >= MONITOR_SLO.barCoverageMin,
		window?.shadowSuccessRate == null ? null : window.shadowSuccessRate >= MONITOR_SLO.shadowSuccessMin,
	];
	const observed = checks.filter((check) => check != null);
	return { passing: observed.filter(Boolean).length, observed: observed.length, total: checks.length };
}
