import type { LoaderFunctionArgs } from "react-router";

// API route to fetch positions from Alpaca
// This acts as a secure proxy so API keys aren't exposed to the client/service worker
export async function loader({ request }: LoaderFunctionArgs) {
	const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
	const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
	const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";

	// Verify environment variables are set
	if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
		return new Response(
			JSON.stringify({ 
				error: "Alpaca API credentials not configured",
				message: "Please set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables."
			}),
			{ 
				status: 500,
				headers: { "Content-Type": "application/json" }
			}
		);
	}

	const headers = {
		"APCA-API-KEY-ID": ALPACA_API_KEY,
		"APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
	};

	try {
		const requestTime = new Date().toISOString();
		console.log(`[API /api/positions] ${requestTime} - Fetching positions from Alpaca...`);
		
		// Fetch current positions from Alpaca with cache busting
		const positionsResponse = await fetch(`${ALPACA_BASE_URL}/v2/positions`, { 
			headers,
			cache: 'no-store', // Force fresh fetch
		});
		
		if (!positionsResponse.ok) {
			const errorText = await positionsResponse.text();
			console.error("[API /api/positions] Failed to fetch positions:", positionsResponse.status, errorText);
			
			return new Response(
				JSON.stringify({ 
					error: "Failed to fetch positions from Alpaca",
					status: positionsResponse.status,
					details: errorText
				}),
				{ 
					status: positionsResponse.status,
					headers: { "Content-Type": "application/json" }
				}
			);
		}

		const positions = await positionsResponse.json();
		console.log(`[API /api/positions] ✅ Fetched ${positions.length} positions from Alpaca`);
		console.log(`[API /api/positions] Symbols:`, positions.map((p: any) => p.symbol));
		
		// Return positions with aggressive cache prevention headers
		return new Response(JSON.stringify(positions), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
				"Pragma": "no-cache",
				"Expires": "0",
			},
		});
	} catch (error) {
		console.error("Error in positions API:", error);
		
		return new Response(
			JSON.stringify({ 
				error: "Internal server error",
				message: error instanceof Error ? error.message : "Unknown error"
			}),
			{ 
				status: 500,
				headers: { "Content-Type": "application/json" }
			}
		);
	}
}
