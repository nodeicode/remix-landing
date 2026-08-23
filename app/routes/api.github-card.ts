import type { LoaderFunctionArgs } from "react-router";
import { renderEngineeringCard } from "~/utils/github-card.server";
import { fetchGitHubActivity } from "~/utils/github-activity.server";
import { fetchPublicMonitorSummary } from "~/utils/public-monitor.server";

export const config = { runtime: "nodejs", maxDuration: 15 };

/**
 * Public, script-free portfolio card for README and other remote <img> embeds.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	const theme = new URL(request.url).searchParams.get("theme") === "light" ? "light" : "dark";
	const monitorPromise = fetchPublicMonitorSummary().catch((error) => {
		console.warn("[api/github-card] public monitor unavailable", error);
		return null;
	});
	const activityPromise = fetchGitHubActivity().catch(() => null);

	try {
		const [monitor, activity] = await Promise.all([monitorPromise, activityPromise]);
		return new Response(renderEngineeringCard({ generatedAt: Date.now(), monitor, activity }, theme), {
			headers: {
				"Content-Type": "image/svg+xml; charset=utf-8",
				"Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
				"CDN-Cache-Control": "public, max-age=60",
			},
		});
	} catch (error) {
		console.error("[api/github-card] failed to render", error);
		return new Response("Engineering card is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
	}
}
