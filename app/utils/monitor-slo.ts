import { DEFAULT_DATA_DELAY_MIN } from "~/utils/monitor-aggregate";

/** Shared performance budgets used by the private dashboard. */
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
