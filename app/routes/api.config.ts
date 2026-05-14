import type { LoaderFunctionArgs } from "react-router";
import { fetchParameter } from "~/utils/ssm.server";

export const config = {
	runtime: "nodejs",
	maxDuration: 10,
};

/**
 * GET /api/config
 *
 * Reads the strategies_config parameter for prod and staging from SSM and
 * returns the parsed JSON.  Intentionally read-only — no mutation handlers.
 *
 * Parameter names can be overridden via env vars:
 *   SSM_PROD_STRATEGIES_PARAM    (default: /trading/prod/strategies_config)
 *   SSM_STAGING_STRATEGIES_PARAM (default: /trading/staging/strategies_config)
 */
export async function loader(_args: LoaderFunctionArgs) {
	const prodParam =
		process.env.SSM_PROD_STRATEGIES_PARAM ?? "/trading/prod/strategies_config";
	const stagingParam =
		process.env.SSM_STAGING_STRATEGIES_PARAM ?? "/trading/staging/strategies_config";

	const [prodResult, stagingResult] = await Promise.allSettled([
		fetchParameter(prodParam),
		fetchParameter(stagingParam),
	]);

	function parseResult(result: PromiseSettledResult<string | null>) {
		if (result.status === "rejected") {
			return { config: null, raw: null, error: String(result.reason) };
		}
		const raw = result.value;
		if (raw === null) {
			return { config: null, raw: null, error: "Parameter not found" };
		}
		try {
			return { config: JSON.parse(raw), raw, error: null };
		} catch (e) {
			// Return the raw string so the UI can display it for debugging
			return { config: null, raw, error: `Invalid JSON: ${String(e)}` };
		}
	}

	return Response.json({
		prod: parseResult(prodResult),
		staging: parseResult(stagingResult),
	});
}
