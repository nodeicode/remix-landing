import type { LoaderFunctionArgs } from "react-router";
import { fetchLogs } from "~/utils/cloudwatch.server";

// GET /api/signals?env=prod&startMs=X&endMs=Y
export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);

	const envParam = url.searchParams.get("env") ?? "prod";
	const envs = envParam
		.split(",")
		.map((e) => e.trim())
		.filter((e): e is "prod" | "staging" => e === "prod" || e === "staging");

	const now = Date.now();
	const startMs = parseInt(url.searchParams.get("startMs") ?? String(now - 7 * 86_400_000), 10);
	const endMs = parseInt(url.searchParams.get("endMs") ?? String(now), 10);

	if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
		return Response.json({ error: "Invalid startMs/endMs" }, { status: 400 });
	}

	const t0 = Date.now();
	try {
		const result = await fetchLogs({
			envs: envs.length > 0 ? envs : ["prod"],
			startMs,
			endMs,
		});

		// Server-side filter: weekdays + 13:00–21:00 UTC (market hours) only
		const filtered = result.lines.filter((l) => {
			const d = new Date(l.ts);
			const day = d.getUTCDay(); // 0=Sun, 6=Sat
			if (day === 0 || day === 6) return false;
			const h = d.getUTCHours();
			return h >= 13 && h < 21;
		});

		return Response.json({
			lines: filtered,
			meta: {
				count: filtered.length,
				truncated: result.truncated,
				fetchMs: Date.now() - t0,
				startMs,
				endMs,
			},
		});
	} catch (err) {
		console.error("[api/signals] fetchLogs error:", err);
		return Response.json(
			{ error: err instanceof Error ? err.message : "Failed to fetch logs" },
			{ status: 500 },
		);
	}
}
