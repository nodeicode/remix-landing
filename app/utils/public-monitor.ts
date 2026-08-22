/** A deliberately limited public contract for the portfolio diagnostic. */
export type PublicMetric = {
	count: number;
	p50Ns: number | null;
	p99Ns: number | null;
	maxNs: number | null;
};

export type PublicMonitorWindow = {
	startMs: number;
	endMs: number;
	eventCount: number;
	heartbeatAgeMs: number | null;
	shadowMatchRate: number | null;
	barCoverageRate: number | null;
	shadowSuccessRate: number | null;
	processing: PublicMetric | null;
	stages: Record<string, PublicMetric>;
	queueLag: PublicMetric;
	freshness: PublicMetric;
	trend: Array<{ ts: number; processingP99Ns: number | null }>;
};

export type PublicMonitorSummary = {
	asOfMs: number;
	windows: { day: PublicMonitorWindow; week: PublicMonitorWindow };
};
