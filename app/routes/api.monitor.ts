import type { LoaderFunctionArgs } from "react-router";
import { fetchMonitorInsights } from "~/utils/monitor.server";

export const config = {
	runtime: "nodejs",
	maxDuration: 60,
};

// GET /api/monitor?env=prod&startMs=X&endMs=Y&beforeMs=Y
// beforeMs: optional progressive cursor — returns one day ending at beforeMs
export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const envParam = url.searchParams.get("env") ?? "prod";
	const env = envParam === "staging" ? "staging" : "prod";

	const now = Date.now();
	const startMs = parseInt(url.searchParams.get("startMs") ?? String(now - 86_400_000), 10);
	const endMs = parseInt(url.searchParams.get("endMs") ?? String(now), 10);
	const beforeParam = url.searchParams.get("beforeMs");
	const beforeMs = beforeParam != null ? parseInt(beforeParam, 10) : undefined;

	if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
		return Response.json({ error: "Invalid startMs/endMs" }, { status: 400 });
	}
	if (beforeMs != null && isNaN(beforeMs)) {
		return Response.json({ error: "Invalid beforeMs" }, { status: 400 });
	}

	try {
		const insights = await fetchMonitorInsights({
			env,
			startMs,
			endMs,
			beforeMs,
		});
		return Response.json(insights);
	} catch (err) {
		console.error("[api/monitor] error:", err);
		return Response.json(
			{ error: err instanceof Error ? err.message : "Failed to fetch monitor insights" },
			{ status: 500 },
		);
	}
}
