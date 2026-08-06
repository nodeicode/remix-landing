import {
	CloudWatchLogsClient,
	FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

export interface LogLine {
	ts: number; // Unix ms
	msg: string; // raw message text
	stream: string; // log stream name
	env: "prod" | "staging";
	group: "trader" | "monitor";
}

const LOG_GROUPS: Record<"prod" | "staging", { name: string; group: "trader" | "monitor" }[]> = {
	prod: [
		{ name: "/trading/prod/trader", group: "trader" },
		{ name: "/trading/prod/monitor", group: "monitor" },
	],
	staging: [
		{ name: "/trading/staging/trader", group: "trader" },
		{ name: "/trading/staging/monitor", group: "monitor" },
	],
};

const MAX_LINES_PER_GROUP = 2000;
const MAX_PAGES = 3; // legacy path safety cap (signals / truncated newest)
const MAX_NARROW_ATTEMPTS = 8;

/** Exhaustive parallel fetch: ~1 day windows, high page budget per window. */
export const CHUNK_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES_PER_CHUNK = 20; // up to ~20k events/day before hard stop
const CHUNK_CONCURRENCY = 8;

let _client: CloudWatchLogsClient | null = null;
function getClient() {
	if (!_client) {
		_client = new CloudWatchLogsClient({ region: process.env.AWS_REGION ?? "us-east-1" });
	}
	return _client;
}

function buildDayChunks(startMs: number, endMs: number): { start: number; end: number }[] {
	const chunks: { start: number; end: number }[] = [];
	let end = endMs;
	while (end > startMs) {
		const start = Math.max(startMs, end - CHUNK_MS);
		chunks.push({ start, end });
		end = start;
	}
	return chunks;
}

async function mapPool<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i]!);
		}
	}
	const n = Math.min(concurrency, Math.max(1, items.length));
	await Promise.all(Array.from({ length: n }, () => worker()));
	return results;
}

/** Fetch pages until exhausted or caps hit (oldest-first within window). */
async function fetchWindow(
	client: CloudWatchLogsClient,
	logGroupName: string,
	group: "trader" | "monitor",
	env: "prod" | "staging",
	startMs: number,
	endMs: number,
	filterPattern: string | undefined,
	maxPages: number,
	maxLines: number,
): Promise<{ lines: LogLine[]; hasMore: boolean }> {
	const lines: LogLine[] = [];
	let nextToken: string | undefined;
	let pages = 0;
	do {
		const res = await client.send(
			new FilterLogEventsCommand({
				logGroupName,
				startTime: startMs,
				endTime: endMs,
				filterPattern: filterPattern || undefined,
				nextToken,
				limit: 1000,
			}),
		);
		pages++;
		for (const e of res.events ?? []) {
			lines.push({
				ts: e.timestamp ?? 0,
				msg: (e.message ?? "").trimEnd(),
				stream: e.logStreamName ?? "",
				env,
				group,
			});
		}
		nextToken = res.nextToken;
	} while (nextToken && lines.length < maxLines && pages < maxPages);

	return { lines, hasMore: Boolean(nextToken) };
}

/**
 * FilterLogEvents returns oldest-first. When a window exceeds our page budget,
 * binary-shrink startTime so we keep the newest events near endMs.
 * Used by the logs table progressive path.
 */
async function fetchLogGroupNewest(
	client: CloudWatchLogsClient,
	logGroupName: string,
	group: "trader" | "monitor",
	env: "prod" | "staging",
	startMs: number,
	endMs: number,
	filterPattern?: string,
): Promise<{ lines: LogLine[]; truncated: boolean }> {
	let windowStart = startMs;
	let truncated = false;

	for (let attempt = 0; attempt < MAX_NARROW_ATTEMPTS; attempt++) {
		const { lines, hasMore } = await fetchWindow(
			client,
			logGroupName,
			group,
			env,
			windowStart,
			endMs,
			filterPattern,
			MAX_PAGES,
			MAX_LINES_PER_GROUP,
		);

		if (!hasMore) {
			return { lines, truncated: truncated || windowStart > startMs };
		}

		truncated = true;
		const mid = Math.floor((windowStart + endMs) / 2);
		if (mid <= windowStart) {
			return {
				lines: lines.slice(-MAX_LINES_PER_GROUP),
				truncated: true,
			};
		}
		windowStart = mid;
	}

	const { lines } = await fetchWindow(
		client,
		logGroupName,
		group,
		env,
		windowStart,
		endMs,
		filterPattern,
		MAX_PAGES,
		MAX_LINES_PER_GROUP,
	);
	return { lines: lines.slice(-MAX_LINES_PER_GROUP), truncated: true };
}

/**
 * Exhaustive fetch for a single day-sized window (no binary narrow).
 * Prefer this for monitor aggregation so 1d of heartbeats is not truncated.
 */
async function fetchLogGroupChunk(
	client: CloudWatchLogsClient,
	logGroupName: string,
	group: "trader" | "monitor",
	env: "prod" | "staging",
	startMs: number,
	endMs: number,
	filterPattern?: string,
): Promise<{ lines: LogLine[]; truncated: boolean }> {
	const { lines, hasMore } = await fetchWindow(
		client,
		logGroupName,
		group,
		env,
		startMs,
		endMs,
		filterPattern,
		MAX_PAGES_PER_CHUNK,
		MAX_PAGES_PER_CHUNK * 1000,
	);
	return { lines, truncated: hasMore };
}

/** Legacy / logs-table path: newest-biased with page caps. */
export async function fetchLogs({
	envs = ["prod", "staging"] as ("prod" | "staging")[],
	startMs,
	endMs,
	filterPattern,
	groups,
}: {
	envs?: ("prod" | "staging")[];
	startMs: number;
	endMs: number;
	filterPattern?: string;
	groups?: ("trader" | "monitor")[];
}): Promise<{ lines: LogLine[]; truncated: boolean }> {
	const client = getClient();
	let truncated = false;
	const allLines: LogLine[] = [];
	const allow = groups ? new Set(groups) : null;

	const jobs = envs.flatMap((env) =>
		LOG_GROUPS[env]
			.filter(({ group }) => !allow || allow.has(group))
			.map(async ({ name, group }) => {
				const result = await fetchLogGroupNewest(
					client,
					name,
					group,
					env,
					startMs,
					endMs,
					filterPattern,
				);
				if (result.truncated) truncated = true;
				allLines.push(...result.lines);
			}),
	);

	await Promise.all(jobs);

	allLines.sort((a, b) => a.ts - b.ts);
	return { lines: allLines, truncated };
}

/**
 * Parallel day-chunk fetch — used by monitor insights so 1w/1m load full
 * coverage without binary-narrowing away older days.
 */
export async function fetchLogsParallel({
	envs = ["prod"] as ("prod" | "staging")[],
	startMs,
	endMs,
	filterPattern,
	groups,
}: {
	envs?: ("prod" | "staging")[];
	startMs: number;
	endMs: number;
	filterPattern?: string;
	groups?: ("trader" | "monitor")[];
}): Promise<{ lines: LogLine[]; truncated: boolean }> {
	const client = getClient();
	const allow = groups ? new Set(groups) : null;
	const chunks = buildDayChunks(startMs, endMs);
	let truncated = false;
	const allLines: LogLine[] = [];

	const targets = envs.flatMap((env) =>
		LOG_GROUPS[env]
			.filter(({ group }) => !allow || allow.has(group))
			.map(({ name, group }) => ({ env, name, group })),
	);

	// Parallelize (chunk × log-group) with concurrency limit
	const work = targets.flatMap((t) =>
		chunks.map((c) => ({ ...t, start: c.start, end: c.end })),
	);

	const results = await mapPool(work, CHUNK_CONCURRENCY, async (w) => {
		return fetchLogGroupChunk(
			client,
			w.name,
			w.group,
			w.env,
			w.start,
			w.end,
			filterPattern,
		);
	});

	for (const r of results) {
		if (r.truncated) truncated = true;
		allLines.push(...r.lines);
	}

	allLines.sort((a, b) => a.ts - b.ts);
	return { lines: allLines, truncated };
}
