import type { LoaderFunctionArgs } from "react-router";
import { fetchGitHubCardData, renderGitHubCard } from "~/utils/github-card.server";
import { fetchPublicMonitorSummary } from "~/utils/public-monitor.server";

export const config = { runtime: "nodejs", maxDuration: 15 };

/**
 * Public, script-free status card for README and other remote <img> embeds.
 * Optional environment: GITHUB_USERNAME (defaults to nodeicode), GITHUB_TOKEN.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	const theme = new URL(request.url).searchParams.get("theme") === "light" ? "light" : "dark";
	const monitorPromise = fetchPublicMonitorSummary().catch((error) => {
		console.warn("[api/github-card] public monitor unavailable", error);
		return null;
	});

	try {
		const data = await fetchGitHubCardData(await monitorPromise);
		return new Response(renderGitHubCard(data, theme), {
			headers: {
				"Content-Type": "image/svg+xml; charset=utf-8",
				"Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
				"CDN-Cache-Control": "public, max-age=60",
			},
		});
	} catch (error) {
		console.error("[api/github-card] failed to render", error);
		return new Response("GitHub card data is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
	}
}
