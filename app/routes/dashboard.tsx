import { useState, useMemo, useEffect } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { TradesTable } from "../components/trades-table";
import { ActivePositions } from "../components/active-positions";
import { SyncStatus } from "../components/sync-status";
import { NotificationPermission } from "../components/notification-permission";

// Types for Alpaca API responses
interface PortfolioHistoryData {
	timestamp: number[];
	equity: number[];
	profit_loss: number[];
	profit_loss_pct: number[];
	base_value: number;
	timeframe: string;
}

interface Position {
	asset_id: string;
	symbol: string;
	exchange: string;
	asset_class: string;
	avg_entry_price: string;
	qty: string;
	side: string;
	market_value: string;
	cost_basis: string;
	unrealized_pl: string;
	unrealized_plpc: string;
	unrealized_intraday_pl: string;
	unrealized_intraday_plpc: string;
	current_price: string;
	lastday_price: string;
	change_today: string;
}

interface Activity {
	id: string;
	activity_type: string;
	transaction_time: string;
	type: string;
	price: string;
	qty: string;
	side: string;
	symbol: string;
	leaves_qty: string;
	order_id: string;
	cum_qty: string;
	order_status: string;
}

type Timeframe = "1D" | "1W" | "1M" | "3M" | "ALL";

// Server-side loader to fetch data from Alpaca API
export async function loader() {
	const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
	const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
	const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";

	console.log("Alpaca config:", {
		hasApiKey: !!ALPACA_API_KEY,
		hasSecretKey: !!ALPACA_SECRET_KEY,
		baseUrl: ALPACA_BASE_URL,
	});

	if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
		console.error("Missing Alpaca credentials - check environment variables");
		throw new Response(
			"Alpaca API credentials not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables.",
			{ status: 500 }
		);
	}

	const headers = {
		"APCA-API-KEY-ID": ALPACA_API_KEY,
		"APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
	};

	try {
		// Fetch portfolio history for different timeframes
		const timeframes = ["1D", "1W", "1M", "3M", "ALL"];
		const portfolioHistoryPromises = timeframes.map(async (timeframe) => {
			const period =
				timeframe === "1D"
					? "1D"
					: timeframe === "1W"
						? "1W"
						: timeframe === "1M"
							? "1M"
							: timeframe === "3M"
								? "3M"
								: "all";

			const historyUrl = `${ALPACA_BASE_URL}/v2/account/portfolio/history?period=${period}&timeframe=${
				timeframe === "1D" ? "5Min" : timeframe === "1W" ? "1H" : "1D"
			}`;

			const response = await fetch(historyUrl, { headers });
			if (!response.ok) {
				const errorText = await response.text();
				console.error(`Failed to fetch ${timeframe} history:`, response.status, errorText);
				throw new Error(
					`Failed to fetch ${timeframe} history: ${response.status} ${errorText}`
				);
			}
			return { timeframe, data: await response.json() };
		});

		// Fetch current positions
		const positionsResponse = await fetch(`${ALPACA_BASE_URL}/v2/positions`, { headers });
		if (!positionsResponse.ok) {
			const errorText = await positionsResponse.text();
			console.error("Failed to fetch positions:", positionsResponse.status, errorText);
			throw new Error(`Failed to fetch positions: ${positionsResponse.status} ${errorText}`);
		}
		const positions: Position[] = await positionsResponse.json();

		// Fetch account activities (trades) - max page_size is 100 per Alpaca API
		// Fetch multiple pages if needed to get up to 500 activities
		let allActivities: Activity[] = [];
		let pageToken: string | null = null;
		const maxActivities = 500;
		const pageSize = 100;

		while (allActivities.length < maxActivities) {
			const activitiesUrl: string = pageToken
				? `${ALPACA_BASE_URL}/v2/account/activities/FILL?page_size=${pageSize}&page_token=${pageToken}`
				: `${ALPACA_BASE_URL}/v2/account/activities/FILL?page_size=${pageSize}`;

			console.log("Fetching activities from:", activitiesUrl);
			const activitiesResponse: Response = await fetch(activitiesUrl, { headers });

			if (!activitiesResponse.ok) {
				const errorText = await activitiesResponse.text();
				console.error("Failed to fetch activities:", activitiesResponse.status, errorText);
				throw new Error(
					`Failed to fetch activities: ${activitiesResponse.status} ${errorText}`
				);
			}

			const pageActivities: Activity[] = await activitiesResponse.json();
			allActivities = [...allActivities, ...pageActivities];

			// Check if there are more pages
			const nextPageToken: string | null = activitiesResponse.headers.get("x-page-token");
			if (!nextPageToken || pageActivities.length < pageSize) {
				// No more pages or last page wasn't full
				break;
			}
			pageToken = nextPageToken;
		}

		console.log(`Fetched ${allActivities.length} activities`);
		const activities = allActivities;

		const portfolioHistory = await Promise.all(portfolioHistoryPromises);
		const portfolioHistoryMap = Object.fromEntries(
			portfolioHistory.map(({ timeframe, data }) => [timeframe, data])
		);

		return Response.json({
			portfolioHistory: portfolioHistoryMap,
			positions,
			activities,
		});
	} catch (error) {
		console.error("Error fetching Alpaca data:", error);
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		throw new Response(`Error fetching data: ${errorMessage}`, { status: 500 });
	}
}

export default function Dashboard() {
	const data = useLoaderData<typeof loader>();
	const revalidator = useRevalidator();
	const { portfolioHistory, positions, activities } = data as {
		portfolioHistory: Record<string, PortfolioHistoryData>;
		positions: Position[];
		activities: Activity[];
	};

	const [filteredSymbol, setFilteredSymbol] = useState<string>("all");
	const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("ALL");
	const [sortConfig, setSortConfig] = useState<{
		key: string;
		direction: "asc" | "desc";
	} | null>(null);

	// Register service worker and subscribe to push notifications
	useEffect(() => {
		if ("serviceWorker" in navigator) {
			navigator.serviceWorker
				.register("/sw.js")
				.then(async (registration) => {
					console.log("[Dashboard] Service Worker registered:", registration);

					// Request notification permission
					let permission = Notification.permission;
					if ("Notification" in window && permission === "default") {
						permission = await Notification.requestPermission();
						console.log("[Dashboard] Notification permission:", permission);
					}

					// Subscribe to push notifications if permission granted
					if (permission === "granted") {
						try {
							// Wait for service worker to be ready
							await navigator.serviceWorker.ready;

							// IMPORTANT: Replace with your actual VAPID public key from step 1
							const vapidPublicKey = "YOUR_VAPID_PUBLIC_KEY_HERE";

							// Check if already subscribed
							let subscription = await registration.pushManager.getSubscription();

							if (!subscription) {
								// Helper function to convert VAPID key
								const urlBase64ToUint8Array = (base64String: string) => {
									const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
									const base64 = (base64String + padding)
										.replace(/\-/g, "+")
										.replace(/_/g, "/");
									const rawData = window.atob(base64);
									const outputArray = new Uint8Array(rawData.length);
									for (let i = 0; i < rawData.length; ++i) {
										outputArray[i] = rawData.charCodeAt(i);
									}
									return outputArray;
								};

								// Subscribe to push notifications
								subscription = await registration.pushManager.subscribe({
									userVisibleOnly: true,
									applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
								});

								console.log("[Dashboard] ✅ Subscribed to push notifications");

								// Send subscription to server
								await fetch("/api/subscribe", {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify(subscription.toJSON()),
								});

								console.log("[Dashboard] ✅ Subscription sent to server");
							} else {
								console.log("[Dashboard] ✅ Already subscribed to push notifications");
							}
						} catch (error) {
							console.error(
								"[Dashboard] ❌ Failed to subscribe to push notifications:",
								error
							);
						}
					}

					// Listen for messages from service worker
					const handleMessage = (event: MessageEvent) => {
						console.log("[Dashboard] Service worker message:", event.data);

						// Revalidate data when sync completes with changes
						if (event.data.type === "SYNC_COMPLETED" && event.data.hasChanges) {
							console.log("[Dashboard] 🔄 Position changes detected!");
							revalidator.revalidate();
						}
					};

					navigator.serviceWorker.addEventListener("message", handleMessage);

					// Cleanup listener on unmount
					return () => {
						navigator.serviceWorker.removeEventListener("message", handleMessage);
					};
				})
				.catch((error) => {
					console.error("[Dashboard] Service Worker registration failed:", error);
				});
		}
	}, [revalidator]);

	// Helper function to extract underlying ticker from option symbols
	// Option format: AAPL250117C00150000 -> AAPL
	const getUnderlyingTicker = (symbol: string): string => {
		// Check if it's an option (6 digits for date YYMMDD)
		const optionMatch = symbol.match(/^([A-Z]+)\d{6}[CP]/);
		if (optionMatch) {
			return optionMatch[1];
		}
		return symbol;
	};

	// Calculate realized P&L by matching buy and sell orders using FIFO
	const tradeHistory = useMemo(() => {
		// Group activities by symbol
		const groupedBySymbol: Record<string, Activity[]> = {};

		activities.forEach((activity) => {
			if (!groupedBySymbol[activity.symbol]) {
				groupedBySymbol[activity.symbol] = [];
			}
			groupedBySymbol[activity.symbol].push(activity);
		});

		// Process each symbol to calculate realized P&L
		const realizedTrades: any[] = [];

		Object.entries(groupedBySymbol).forEach(([symbol, symbolActivities]) => {
			// Sort by time (oldest first) for FIFO
			const sorted = [...symbolActivities].sort(
				(a, b) =>
					new Date(a.transaction_time).getTime() - new Date(b.transaction_time).getTime()
			);

			// Queue of buy orders (FIFO)
			const buyQueue: Array<{ price: number; qty: number; date: Date }> = [];

			sorted.forEach((activity) => {
				const price = parseFloat(activity.price);
				const qty = parseFloat(activity.qty);
				const date = new Date(activity.transaction_time);

				if (activity.side === "buy") {
					// Add to buy queue
					buyQueue.push({ price, qty, date });
				} else if (activity.side === "sell") {
					// Match with buy orders using FIFO
					/*
						Match sell orders with buy orders using FIFO
						i.e oldest buys get sold first and we calculate realized P&L based on that
					*/
					let remainingQty = qty;
					let totalCost = 0;
					let totalQty = 0;

					while (remainingQty > 0 && buyQueue.length > 0) {
						const buyOrder = buyQueue[0];
						const qtyToMatch = Math.min(remainingQty, buyOrder.qty);

						totalCost += qtyToMatch * buyOrder.price * 100; // Options are typically for 100 shares
						totalQty += qtyToMatch;
						remainingQty -= qtyToMatch;
						buyOrder.qty -= qtyToMatch;

						if (buyOrder.qty === 0) {
							buyQueue.shift();
						}
					}

					// Calculate P&L for this sell
					// since this P&L is for options we need to multiple by 100
					if (totalQty > 0) {
						const avgBuyPrice = totalCost / totalQty;
						const sellValue = price * 100 * totalQty;
						const buyValue = totalCost;
						const pnl = sellValue - buyValue;
						const pnlPercent = (pnl / buyValue) * 100;

						realizedTrades.push({
							id: activity.id,
							date,
							symbol,
							underlyingTicker: getUnderlyingTicker(symbol),
							quantity: totalQty,
							buyPrice: avgBuyPrice,
							sellPrice: price * 100, // Options are typically for 100 shares
							buyValue,
							sellValue,
							pnl,
							pnlPercent,
						});
					}
				}
			});
		});

		// Sort by date (newest first)
		return realizedTrades.sort((a, b) => b.date.getTime() - a.date.getTime());
	}, [activities]);

	// Filter trades by underlying ticker and timeframe
	const filteredTrades = useMemo(() => {
		let filtered = tradeHistory;

		// Filter by ticker
		if (filteredSymbol !== "all") {
			filtered = filtered.filter((trade) => trade.underlyingTicker === filteredSymbol);
		}

		// Filter by timeframe
		if (selectedTimeframe !== "ALL") {
			const now = new Date();
			const cutoffDate = new Date();

			switch (selectedTimeframe) {
				case "1D":
					cutoffDate.setDate(now.getDate() - 1);
					break;
				case "1W":
					cutoffDate.setDate(now.getDate() - 7);
					break;
				case "1M":
					cutoffDate.setMonth(now.getMonth() - 1);
					break;
				case "3M":
					cutoffDate.setMonth(now.getMonth() - 3);
					break;
			}

			filtered = filtered.filter((trade) => trade.date >= cutoffDate);
		}

		return filtered;
	}, [tradeHistory, filteredSymbol, selectedTimeframe]); // Sort trades
	const sortedTrades = useMemo(() => {
		const sorted = [...filteredTrades];
		if (sortConfig) {
			sorted.sort((a, b) => {
				const aVal = a[sortConfig.key as keyof typeof a];
				const bVal = b[sortConfig.key as keyof typeof b];

				if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
				if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
				return 0;
			});
		}
		return sorted;
	}, [filteredTrades, sortConfig]);

	// Get unique underlying tickers for filter
	const uniqueSymbols = useMemo(() => {
		return Array.from(new Set(tradeHistory.map((trade) => trade.underlyingTicker))).sort();
	}, [tradeHistory]);

	// Calculate metrics from ALL trades (not filtered)
	const metrics = useMemo(() => {
		const winningTrades = tradeHistory.filter((trade) => trade.pnl > 0).length;
		const totalTrades = tradeHistory.length;
		const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

		return {
			winRate,
			totalTrades,
		};
	}, [tradeHistory]);

	// Calculate portfolio P&L and risk-adjusted metrics based on selected timeframe
	const portfolioMetrics = useMemo(() => {
		const historyData = portfolioHistory[selectedTimeframe];

		if (!historyData || !historyData.equity || historyData.equity.length === 0) {
			return {
				startingValue: 0,
				currentValue: 0,
				pnl: 0,
				pnlPercent: 0,
				sharpeRatio: 0,
				sortinoRatio: 0,
				maxDrawdown: 0,
				calmarRatio: 0,
			};
		}

		const startingValue = historyData.base_value;
		const currentValue = historyData.equity[historyData.equity.length - 1];

		// Calculate P&L directly from equity values instead of using API's profit_loss
		const pnl = currentValue - startingValue;
		const pnlPercent = startingValue !== 0 ? pnl / startingValue : 0;

		// Calculate returns array for risk metrics
		const returns: number[] = [];
		for (let i = 1; i < historyData.equity.length; i++) {
			const ret =
				(historyData.equity[i] - historyData.equity[i - 1]) / historyData.equity[i - 1];
			returns.push(ret);
		}

		if (returns.length === 0) {
			return {
				startingValue,
				currentValue,
				pnl,
				pnlPercent,
				sharpeRatio: 0,
				sortinoRatio: 0,
				maxDrawdown: 0,
				calmarRatio: 0,
			};
		}

		// Calculate mean return
		const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

		// Calculate standard deviation
		const variance =
			returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
		const stdDev = Math.sqrt(variance);

		// Sharpe Ratio (assuming 0% risk-free rate for simplicity)
		// Annualized: multiply by sqrt(252) for daily, sqrt(52) for weekly, sqrt(12) for monthly
		const annualizationFactor =
			selectedTimeframe === "1D"
				? Math.sqrt(252)
				: selectedTimeframe === "1W"
					? Math.sqrt(52)
					: selectedTimeframe === "1M"
						? Math.sqrt(12)
						: selectedTimeframe === "3M"
							? Math.sqrt(4)
							: Math.sqrt(252); // Daily for ALL
		const sharpeRatio = stdDev !== 0 ? (meanReturn / stdDev) * annualizationFactor : 0;

		// Sortino Ratio (only downside deviation)
		const downsideReturns = returns.filter((r) => r < 0);
		const downsideVariance =
			downsideReturns.length > 0
				? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
				: 0;
		const downsideStdDev = Math.sqrt(downsideVariance);
		const sortinoRatio =
			downsideStdDev !== 0 ? (meanReturn / downsideStdDev) * annualizationFactor : 0;

		// Maximum Drawdown
		let peak = historyData.equity[0];
		let maxDrawdown = 0;
		for (const equity of historyData.equity) {
			if (equity > peak) {
				peak = equity;
			}
			const drawdown = (peak - equity) / peak;
			if (drawdown > maxDrawdown) {
				maxDrawdown = drawdown;
			}
		}

		// Calmar Ratio (annualized return / max drawdown)
		const annualizedReturn =
			pnlPercent *
			(selectedTimeframe === "1D"
				? 252
				: selectedTimeframe === "1W"
					? 52
					: selectedTimeframe === "1M"
						? 12
						: selectedTimeframe === "3M"
							? 4
							: 1); // No annualization for ALL
		const calmarRatio = maxDrawdown !== 0 ? annualizedReturn / maxDrawdown : 0;

		return {
			startingValue,
			currentValue,
			pnl,
			pnlPercent,
			sharpeRatio,
			sortinoRatio,
			maxDrawdown,
			calmarRatio,
		};
	}, [portfolioHistory, selectedTimeframe]);

	const handleSort = (key: string) => {
		setSortConfig((current) => {
			if (current?.key === key) {
				return {
					key,
					direction: current.direction === "asc" ? "desc" : "asc",
				};
			}
			return { key, direction: "desc" };
		});
	};

	return (
		<div className="bg-gray-50 dark:bg-gray-900 p-3 md:p-6 overflow-auto max-h-screen">
			<div className="max-w-7xl mx-auto pb-[4vh]">
				{/* Header */}
				<div className="mb-6 md:mb-8">
					<h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
						Trading Dashboard
					</h1>
					<p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
						Portfolio performance and trade history
					</p>
				</div>
				{/* Combined Filters Row */}
				<div className="mb-6 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
					<div className="flex flex-col md:flex-row md:items-center gap-4">
						<div className="flex items-center gap-2 flex-1">
							<label className="text-sm text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
								Timeframe:
							</label>
							<div className="flex gap-1 md:gap-2 flex-wrap">
								{(["1D", "1W", "1M", "3M", "ALL"] as Timeframe[]).map((timeframe) => (
									<button
										key={timeframe}
										onClick={() => setSelectedTimeframe(timeframe)}
										className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm rounded-lg font-medium transition-colors ${
											selectedTimeframe === timeframe
												? "bg-blue-600 text-white"
												: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
										}`}
									>
										{timeframe}
									</button>
								))}
							</div>
						</div>
						<div className="flex items-center gap-2 flex-1">
							<label className="text-sm text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
								Filter by Ticker:
							</label>
							<select
								value={filteredSymbol}
								onChange={(e) => setFilteredSymbol(e.target.value)}
								className="flex-1 px-3 md:px-4 py-1.5 md:py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
							>
								<option value="all">All Tickers</option>
								{uniqueSymbols.map((symbol) => (
									<option key={symbol} value={symbol}>
										{symbol}
									</option>
								))}
							</select>
						</div>

						{/* Status Indicators */}
						<div className="flex items-center gap-2 flex-wrap">
							<NotificationPermission />
							<SyncStatus className="px-3 md:px-4 py-1.5 md:py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700" />
						</div>
					</div>
				</div>{" "}
				{/* Portfolio Summary Cards */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							Starting Value ({selectedTimeframe})
						</div>
						<div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
							$
							{portfolioMetrics.startingValue.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							Current Value
						</div>
						<div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
							$
							{portfolioMetrics.currentValue.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							P&L ({selectedTimeframe})
						</div>
						<div
							className={`text-xl md:text-2xl font-bold ${
								portfolioMetrics.pnl >= 0
									? "text-green-600 dark:text-green-400"
									: "text-red-600 dark:text-red-400"
							}`}
						>
							{portfolioMetrics.pnl >= 0 ? "+" : ""}$
							{portfolioMetrics.pnl.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							P&L % ({selectedTimeframe})
						</div>
						<div
							className={`text-xl md:text-2xl font-bold ${
								portfolioMetrics.pnlPercent >= 0
									? "text-green-600 dark:text-green-400"
									: "text-red-600 dark:text-red-400"
							}`}
						>
							{portfolioMetrics.pnlPercent >= 0 ? "+" : ""}
							{(portfolioMetrics.pnlPercent * 100).toFixed(2)}%
						</div>
					</div>
				</div>
				{/* Risk-Adjusted Metrics */}
				<div className="mb-3 md:mb-4">
					<h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-3">
						Risk-Adjusted Performance Metrics
					</h2>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							Sharpe Ratio
							<span className="text-xs ml-1">(Risk/Reward)</span>
						</div>
						<div
							className={`text-xl md:text-2xl font-bold ${
								portfolioMetrics.sharpeRatio >= 1
									? "text-green-600 dark:text-green-400"
									: portfolioMetrics.sharpeRatio >= 0
										? "text-yellow-600 dark:text-yellow-400"
										: "text-red-600 dark:text-red-400"
							}`}
						>
							{portfolioMetrics.sharpeRatio.toFixed(2)}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
							{portfolioMetrics.sharpeRatio >= 2
								? "Excellent"
								: portfolioMetrics.sharpeRatio >= 1
									? "Good"
									: portfolioMetrics.sharpeRatio >= 0
										? "Fair"
										: "Poor"}
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							Sortino Ratio
							<span className="text-xs ml-1">(Downside Risk)</span>
						</div>
						<div
							className={`text-xl md:text-2xl font-bold ${
								portfolioMetrics.sortinoRatio >= 1
									? "text-green-600 dark:text-green-400"
									: portfolioMetrics.sortinoRatio >= 0
										? "text-yellow-600 dark:text-yellow-400"
										: "text-red-600 dark:text-red-400"
							}`}
						>
							{portfolioMetrics.sortinoRatio.toFixed(2)}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
							{portfolioMetrics.sortinoRatio >= 2
								? "Excellent"
								: portfolioMetrics.sortinoRatio >= 1
									? "Good"
									: portfolioMetrics.sortinoRatio >= 0
										? "Fair"
										: "Poor"}
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							Max Drawdown
							<span className="text-xs ml-1">(Peak to Trough)</span>
						</div>
						<div
							className={`text-xl md:text-2xl font-bold ${
								portfolioMetrics.maxDrawdown <= 0.1
									? "text-green-600 dark:text-green-400"
									: portfolioMetrics.maxDrawdown <= 0.2
										? "text-yellow-600 dark:text-yellow-400"
										: "text-red-600 dark:text-red-400"
							}`}
						>
							-{(portfolioMetrics.maxDrawdown * 100).toFixed(2)}%
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
							{portfolioMetrics.maxDrawdown <= 0.1
								? "Low Risk"
								: portfolioMetrics.maxDrawdown <= 0.2
									? "Moderate"
									: portfolioMetrics.maxDrawdown <= 0.3
										? "High"
										: "Very High"}
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							Calmar Ratio
							<span className="text-xs ml-1">(Return/Drawdown)</span>
						</div>
						<div
							className={`text-xl md:text-2xl font-bold ${
								portfolioMetrics.calmarRatio >= 3
									? "text-green-600 dark:text-green-400"
									: portfolioMetrics.calmarRatio >= 0
										? "text-yellow-600 dark:text-yellow-400"
										: "text-red-600 dark:text-red-400"
							}`}
						>
							{portfolioMetrics.calmarRatio.toFixed(2)}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
							{portfolioMetrics.calmarRatio >= 3
								? "Excellent"
								: portfolioMetrics.calmarRatio >= 1
									? "Good"
									: portfolioMetrics.calmarRatio >= 0
										? "Fair"
										: "Poor"}
						</div>
					</div>
				</div>
				{/* Trade Summary */}
				<div className="mb-3 md:mb-4">
					<h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-3">
						Closed Positions Summary
					</h2>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-6">
					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							Total Trades
						</div>
						<div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
							{metrics.totalTrades}
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-gray-700">
						<div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">
							Win Rate
						</div>
						<div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
							{metrics.winRate.toFixed(1)}%
						</div>
					</div>
				</div>
				{/* Active Positions */}
				<div className="mb-6">
					<h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-3">
						Active Positions
					</h2>
					<ActivePositions positions={positions} getUnderlyingTicker={getUnderlyingTicker} />
				</div>
				{/* Trade History */}
				<div className="mb-4">
					<h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-3">
						Trade History ({selectedTimeframe})
						<span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
							{sortedTrades.length} of {metrics.totalTrades} trades
						</span>
					</h2>
				</div>
				{/* Trades Table */}
				<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
					<TradesTable
						trades={sortedTrades}
						onSort={handleSort}
						sortConfig={sortConfig}
						metrics={metrics}
					/>
				</div>
			</div>
		</div>
	);
}
