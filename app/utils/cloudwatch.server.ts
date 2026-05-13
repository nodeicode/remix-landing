import {
	CloudWatchLogsClient,
	FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

export interface LogLine {
	ts: number;        // Unix ms
	msg: string;       // raw message text
	stream: string;    // log stream name
	env: "prod" | "staging";
}

const LOG_GROUPS: Record<"prod" | "staging", string> = {
	prod: "/trading/prod/trader",
	staging: "/trading/staging/trader",
};

const MAX_LINES_PER_ENV = 2000;
const MAX_PAGES = 3; // safety cap: prevents runaway sequential calls on busy log groups

let _client: CloudWatchLogsClient | null = null;
function getClient() {
	if (!_client) {
		_client = new CloudWatchLogsClient({ region: process.env.AWS_REGION ?? "us-east-1" });
	}
	return _client;
}

export async function fetchLogs({
	envs = ["prod", "staging"] as ("prod" | "staging")[],
	startMs,
	endMs,
	filterPattern,
}: {
	envs?: ("prod" | "staging")[];
	startMs: number;
	endMs: number;
	filterPattern?: string;
}): Promise<{ lines: LogLine[]; truncated: boolean }> {
	const client = getClient();
	let truncated = false;
	const allLines: LogLine[] = [];

	await Promise.all(
		envs.map(async (env) => {
			const lines: LogLine[] = [];
			let nextToken: string | undefined;
			let pages = 0;
			do {
				const res = await client.send(
					new FilterLogEventsCommand({
						logGroupName: LOG_GROUPS[env],
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
					});
				}
				nextToken = res.nextToken;
			} while (nextToken && lines.length < MAX_LINES_PER_ENV && pages < MAX_PAGES);

			if (lines.length >= MAX_LINES_PER_ENV) truncated = true;
			allLines.push(...lines);
		}),
	);

	allLines.sort((a, b) => a.ts - b.ts);
	return { lines: allLines, truncated };
}
