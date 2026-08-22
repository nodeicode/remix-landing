import type { LoaderFunctionArgs } from "react-router";
import { fetchPublicMonitorSummary } from "~/utils/public-monitor.server";

export const config = { runtime: "nodejs", maxDuration: 60 };

/** Public publication layer: fixed-window aggregates with no request parameters. */
export async function loader(_args: LoaderFunctionArgs) {
	try {
		const summary = await fetchPublicMonitorSummary();
		return Response.json(summary, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
	} catch (error) {
		console.error("[api/public-monitor] failed to load aggregate telemetry", error);
		return Response.json({ error: "Diagnostic data is temporarily unavailable." }, { status: 503 });
	}
}
