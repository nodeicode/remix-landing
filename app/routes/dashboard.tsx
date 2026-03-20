import { useState, useMemo, useEffect, useCallback } from "react";
import { useRevalidator } from "react-router";
import {
	Menu,
	X,
	Bell,
	RefreshCw,
	TrendingUp,
	TrendingDown,
	BarChart3,
	Shield,
	Activity,
	Target,
} from "lucide-react";
import { TradesTable } from "../components/trades-table";
import { ActivePositions } from "../components/active-positions";
import { SyncStatus } from "../components/sync-status";
import { NotificationPermission } from "../components/notification-permission";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";
import { PortfolioChart } from "../components/portfolio-chart";

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

interface AccountConfig {
	id: string;
	name: string;
	type: "LIVE" | "PAPER";
	apiKey: string;
	secretKey: string;
	baseUrl: string;
}

interface AccountData {
	id: string;
	name: string;
	type: "LIVE" | "PAPER";
	portfolioHistory: Record<string, PortfolioHistoryData>;
	positions: Position[];
	activities: Activity[];
	legToParentOrder: Record<string, string>;
	buyingPower?: number;
	equity?: number;
}

// Helper to fetch data for a single account
// Removed fetchAccountData and loader in favor of API route

export default function Dashboard() {
	const [accounts, setAccounts] = useState<AccountData[]>([]);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const fetchAccounts = useCallback(async (isBackground = false) => {
		if (!isBackground) {
			setError(null);
		}
		try {
			const response = await fetch("/api/accounts");
			if (!response.ok) {
				throw new Error(`Failed to fetch accounts (${response.status})`);
			}
			const data = await response.json();
			if (!data.accounts) {
				throw new Error(data.error ?? "No accounts in response");
			}
			setAccounts(data.accounts);
			setError(null);
			setLastUpdated(new Date());
		} catch (err) {
			console.error("Error fetching accounts:", err);
			// On background polls, preserve stale data — only show the error
			// screen when we have nothing to display yet.
			setAccounts((prev) => {
				if (prev.length === 0) {
					setError("Failed to load account data");
				}
				return prev;
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchAccounts(false);
		const interval = setInterval(() => fetchAccounts(true), 12000);
		return () => clearInterval(interval);
	}, [fetchAccounts]);

	const [selectedAccountId, setSelectedAccountId] = useState<string>("");

	useEffect(() => {
		if (accounts.length > 0 && !selectedAccountId) {
			setSelectedAccountId(accounts[0].id);
		}
	}, [accounts, selectedAccountId]);

	const currentAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

	// Destructure from the currently selected account
	const { portfolioHistory, positions, activities, legToParentOrder } = currentAccount || {
		portfolioHistory: {},
		positions: [],
		activities: [],
		legToParentOrder: {},
	};

	const revalidator = useRevalidator();

	const [filteredSymbol, setFilteredSymbol] = useState<string>("all");
	const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("ALL");
	const [sortConfig, setSortConfig] = useState<{
		key: string;
		direction: "asc" | "desc";
	} | null>(null);
	const [isResetting, setIsResetting] = useState(false);
	const [isTesting, setIsTesting] = useState(false);

	// Send a test notification
	const sendTestNotification = async () => {
		setIsTesting(true);
		try {
			const response = await fetch("/api/test-notification", {
				method: "POST",
			});
			const result = await response.json();
			if (result.success) {
				alert(result.message);
			} else {
				alert("Failed: " + (result.message || result.error));
			}
		} catch (error) {
			console.error("Error sending test notification:", error);
			alert("Error sending test notification");
		} finally {
			setIsTesting(false);
		}
	};

	// Reset service worker and resubscribe
	const resetServiceWorker = async () => {
		setIsResetting(true);
		try {
			console.log("[Dashboard] 🔄 Resetting service worker...");

			// Unregister existing service worker
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const registration of registrations) {
				await registration.unregister();
				console.log("[Dashboard] ✅ Service worker unregistered");
			}

			// Wait a bit for cleanup
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Re-register service worker
			const registration = await navigator.serviceWorker.register("/sw.js");
			console.log("[Dashboard] ✅ Service worker re-registered:", registration);

			// Request notification permission
			let permission = Notification.permission;
			if ("Notification" in window && permission === "default") {
				permission = await Notification.requestPermission();
				console.log("[Dashboard] Notification permission:", permission);
			}

			// Subscribe to push notifications if permission granted
			if (permission === "granted") {
				await navigator.serviceWorker.ready;

				const vapidPublicKey =
					"BH3j8zyLhRiIOqt4wGx09jh5GRmkwk1-4btu6WhdFqvbP1dpPXRPdTSUTm7AZtif0tiyU2ILjFVQsFj7nRJfxn0";

				// Helper function to convert VAPID key
				const urlBase64ToUint8Array = (base64String: string) => {
					const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
					const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
					const rawData = window.atob(base64);
					const outputArray = new Uint8Array(rawData.length);
					for (let i = 0; i < rawData.length; ++i) {
						outputArray[i] = rawData.charCodeAt(i);
					}
					return outputArray;
				};

				// Subscribe to push notifications
				const subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
				});

				console.log("[Dashboard] ✅ Subscribed to push notifications");

				// Send subscription to server
				console.log("[Dashboard] 📤 Sending subscription to server...");
				const response = await fetch("/api/subscribe", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(subscription.toJSON()),
				});

				if (response.ok) {
					console.log("[Dashboard] ✅ Subscription saved to database");
				} else {
					const errorText = await response.text();
					console.error(
						"[Dashboard] ❌ Failed to save subscription:",
						response.status,
						errorText,
					);
				}
			}

			console.log("[Dashboard] ✅ Service worker reset complete!");
			alert("Service worker reset successfully! Page will reload...");
			window.location.reload();
		} catch (error) {
			console.error("[Dashboard] ❌ Error resetting service worker:", error);
			alert("Failed to reset service worker. Check console for details.");
		} finally {
			setIsResetting(false);
		}
	};

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
							const vapidPublicKey =
								"BH3j8zyLhRiIOqt4wGx09jh5GRmkwk1-4btu6WhdFqvbP1dpPXRPdTSUTm7AZtif0tiyU2ILjFVQsFj7nRJfxn0";

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

								// Send new subscription to server
								console.log("[Dashboard] 📤 Sending new subscription to server...");
								const response = await fetch("/api/subscribe", {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify(subscription.toJSON()),
								});

								if (response.ok) {
									console.log("[Dashboard] ✅ Subscription saved to database");
								} else {
									const errorText = await response.text();
									console.error(
										"[Dashboard] ❌ Failed to save subscription:",
										response.status,
										errorText,
									);
								}
							} else {
								console.log("[Dashboard] ✅ Already subscribed to push notifications");
							}
						} catch (error) {
							console.error(
								"[Dashboard] ❌ Failed to subscribe to push notifications:",
								error,
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
			// Options contracts represent 100 shares; equities have a multiplier of 1
			const isOption = /^[A-Z]+\d{6}[CP]/.test(symbol);
			const multiplier = isOption ? 100 : 1;

			// Sort by time (oldest first) for FIFO
			const sorted = [...symbolActivities].sort(
				(a, b) =>
					new Date(a.transaction_time).getTime() - new Date(b.transaction_time).getTime(),
			);

			// FIFO queues for both long and short positions
			const buyQueue: Array<{ price: number; qty: number; date: Date }> = [];
			const sellQueue: Array<{ price: number; qty: number; date: Date; orderId?: string }> =
				[];

			sorted.forEach((activity) => {
				const price = parseFloat(activity.price);
				const qty = parseFloat(activity.qty);
				const date = new Date(activity.transaction_time);
				const resolvedOrderId =
					legToParentOrder[activity.order_id] || activity.order_id || undefined;

				if (activity.side === "buy") {
					// First try to close a short position (match against sellQueue)
					let remainingQty = qty;
					let totalRevenue = 0;
					let totalQty = 0;

					while (remainingQty > 0 && sellQueue.length > 0) {
						const sellOrder = sellQueue[0];
						const qtyToMatch = Math.min(remainingQty, sellOrder.qty);
						totalRevenue += qtyToMatch * sellOrder.price * multiplier;
						totalQty += qtyToMatch;
						remainingQty -= qtyToMatch;
						sellOrder.qty -= qtyToMatch;
						if (sellOrder.qty === 0) sellQueue.shift();
					}

					if (totalQty > 0) {
						// Short position closed: sellValue = premium received, buyValue = cost to close
						const sellValue = totalRevenue;
						const buyValue = price * multiplier * totalQty;
						const pnl = sellValue - buyValue;
						const pnlPercent = buyValue !== 0 ? (pnl / Math.abs(buyValue)) * 100 : 0;

						realizedTrades.push({
							id: activity.id,
							date,
							symbol,
							underlyingTicker: getUnderlyingTicker(symbol),
							quantity: totalQty,
							buyPrice: price,
							sellPrice: totalRevenue / totalQty / multiplier,
							buyValue,
							sellValue,
							pnl,
							pnlPercent,
							orderId: resolvedOrderId,
						});
					}

					// Leftover qty opens a new long position
					if (remainingQty > 0) {
						buyQueue.push({ price, qty: remainingQty, date });
					}
				} else if (activity.side === "sell") {
					// First try to close a long position (match against buyQueue)
					let remainingQty = qty;
					let totalCost = 0;
					let totalQty = 0;

					while (remainingQty > 0 && buyQueue.length > 0) {
						const buyOrder = buyQueue[0];
						const qtyToMatch = Math.min(remainingQty, buyOrder.qty);
						totalCost += qtyToMatch * buyOrder.price * multiplier;
						totalQty += qtyToMatch;
						remainingQty -= qtyToMatch;
						buyOrder.qty -= qtyToMatch;
						if (buyOrder.qty === 0) buyQueue.shift();
					}

					if (totalQty > 0) {
						// Long position closed
						const buyValue = totalCost;
						const sellValue = price * multiplier * totalQty;
						const avgBuyPrice = totalCost / totalQty / multiplier;
						const pnl = sellValue - buyValue;
						const pnlPercent = buyValue !== 0 ? (pnl / buyValue) * 100 : 0;

						realizedTrades.push({
							id: activity.id,
							date,
							symbol,
							underlyingTicker: getUnderlyingTicker(symbol),
							quantity: totalQty,
							buyPrice: avgBuyPrice,
							sellPrice: price,
							buyValue,
							sellValue,
							pnl,
							pnlPercent,
							orderId: resolvedOrderId,
						});
					}

					// Leftover qty opens a new short position
					if (remainingQty > 0) {
						sellQueue.push({ price, qty: remainingQty, date, orderId: resolvedOrderId });
					}
				}
			});
		});

		// Consolidate partial fills: same order_id + same symbol → single trade with aggregated values.
		// Equity orders commonly fill in multiple pieces at slightly different prices.
		const consolidatedMap = new Map<string, any>();
		for (const trade of realizedTrades) {
			const key = trade.orderId
				? `${trade.orderId}::${trade.symbol}`
				: `standalone::${trade.id}`;
			if (!consolidatedMap.has(key)) {
				consolidatedMap.set(key, { ...trade });
			} else {
				const existing = consolidatedMap.get(key);
				existing.quantity += trade.quantity;
				existing.buyValue += trade.buyValue;
				existing.sellValue += trade.sellValue;
				existing.pnl = existing.sellValue - existing.buyValue;
				existing.pnlPercent =
					existing.buyValue !== 0 ? (existing.pnl / existing.buyValue) * 100 : 0;
				const mult = /^[A-Z]+\d{6}[CP]/.test(trade.symbol) ? 100 : 1;
				existing.buyPrice = existing.buyValue / existing.quantity / mult;
				existing.sellPrice = existing.sellValue / existing.quantity / mult;
				if (trade.date > existing.date) existing.date = trade.date;
			}
		}

		// Sort by date (newest first)
		return [...consolidatedMap.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
	}, [activities, legToParentOrder]);

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

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-zinc-950">
				<div className="text-center space-y-4">
					<div className="relative mx-auto w-12 h-12">
						<div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
						<div className="absolute inset-0 rounded-full border-2 border-t-blue-500 animate-spin" />
					</div>
					<p className="text-zinc-400 text-sm">Loading account data...</p>
				</div>
			</div>
		);
	}

	if (error || !accounts || accounts.length === 0) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-zinc-950">
				<Card className="max-w-md w-full mx-4">
					<CardHeader>
						<CardTitle className="text-red-400">
							{error ? "Error Loading Data" : "No Accounts Available"}
						</CardTitle>
						<CardDescription>
							{error ||
								"Unable to fetch data for any configured accounts. Please check your API keys and internet connection."}
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 flex bg-zinc-950 overflow-hidden">
			{/* ── Mobile sidebar overlay ── */}
			{isSidebarOpen && (
				<div
					className="fixed inset-0 bg-black/60 z-20 sm:hidden"
					onClick={() => setIsSidebarOpen(false)}
				/>
			)}

			{/* ── Left Sidebar ── */}
			<aside
				className={cn(
					"fixed sm:relative inset-y-0 left-0 z-30 w-64 sm:w-52 flex-none flex flex-col border-r border-zinc-800 bg-zinc-950 overflow-y-auto transition-transform duration-300 ease-in-out",
					isSidebarOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0",
				)}
			>
				{/* Brand */}
				<div className="px-4 pt-5 pb-4 border-b border-zinc-800">
					<h1 className="text-base font-bold text-zinc-50 tracking-tight">
						Trading Dashboard
					</h1>
					<p className="text-[10px] text-zinc-500 mt-0.5">Options Portfolio</p>
				</div>

				{/* Account switcher */}
				<div className="px-3 pt-4 pb-2">
					<p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-1">
						Accounts
					</p>
					<div className="flex flex-col gap-1">
						{accounts.map((account) => {
							const isSelected = selectedAccountId === account.id;
							const equity = account.equity ?? 0;
							return (
								<button
									key={account.id}
									onClick={() => setSelectedAccountId(account.id)}
									className={cn(
										"w-full text-left rounded-lg px-3 py-2.5 transition-all border",
										isSelected
											? "bg-zinc-900 border-blue-600/60 ring-1 ring-blue-600/30"
											: "bg-transparent border-transparent hover:bg-zinc-900 hover:border-zinc-700",
									)}
								>
									<div className="flex items-center justify-between gap-1.5 mb-1">
										<span className="text-xs font-semibold text-zinc-100 truncate leading-tight">
											{account.name}
										</span>
										<Badge
											variant={account.type === "LIVE" ? "live" : "paper"}
											className="text-[9px] px-1 py-0 h-4 flex-none"
										>
											{account.type}
										</Badge>
									</div>
									<p className="text-xs font-mono tabular-nums text-zinc-400">
										$
										{equity.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</p>
								</button>
							);
						})}
					</div>
				</div>

				{/* Live pulse / last updated */}
				<div className="px-4 mt-2 mb-4">
					<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
						<span className="relative flex h-2 w-2 flex-none">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
							<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
						</span>
						<div>
							<p className="text-[10px] text-zinc-400 font-medium">Live · 12s</p>
							{lastUpdated && (
								<p className="text-[9px] text-zinc-600 tabular-nums">
									{lastUpdated.toLocaleTimeString([], {
										hour: "2-digit",
										minute: "2-digit",
										second: "2-digit",
									})}
								</p>
							)}
						</div>
					</div>
				</div>

				{/* Spacer */}
				<div className="flex-1" />

				{/* Bottom actions */}
				<div className="px-3 pb-4 pt-2 border-t border-zinc-800 space-y-1">
					<SyncStatus className="w-full px-3 py-2 bg-zinc-900 rounded-lg border border-zinc-800 text-[10px] text-zinc-400" />
					<Button
						variant="ghost"
						size="sm"
						onClick={sendTestNotification}
						disabled={isTesting}
						className="w-full justify-start text-xs text-zinc-400 hover:text-zinc-100"
					>
						{isTesting ? (
							<span className="animate-spin text-base mr-2">⏳</span>
						) : (
							<Bell className="w-3.5 h-3.5 mr-2" />
						)}
						Test Push
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={resetServiceWorker}
						disabled={isResetting}
						className="w-full justify-start text-xs text-zinc-400 hover:text-zinc-100"
					>
						{isResetting ? (
							<span className="animate-spin text-base mr-2">⏳</span>
						) : (
							<RefreshCw className="w-3.5 h-3.5 mr-2" />
						)}
						Reset SW
					</Button>
					<div className="px-3 py-1">
						<NotificationPermission />
					</div>
				</div>
			</aside>

			{/* ── Main content ── */}
			<main className="flex-1 overflow-y-auto flex flex-col min-w-0">
				{/* Mobile top bar */}
				<div className="sm:hidden sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 flex-none">
					<button
						onClick={() => setIsSidebarOpen(!isSidebarOpen)}
						className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
					>
						{isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
					</button>
					<h1 className="text-sm font-bold text-zinc-50 truncate">Trading Dashboard</h1>
					{lastUpdated && (
						<span className="ml-auto text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">
							{lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
						</span>
					)}
				</div>
				<div className="max-w-6xl mx-auto w-full p-3 sm:p-5 pb-12 space-y-4 sm:space-y-6">
					{/* ── Toolbar ── */}
					<Card>
						<CardContent className="p-3">
							<div className="flex flex-col sm:flex-row sm:items-center gap-3">
								{/* Timeframe */}
								<div className="flex items-center gap-2 flex-1 min-w-0">
									<span className="text-xs text-zinc-400 font-medium whitespace-nowrap">
										Timeframe
									</span>
									<div className="flex gap-1 flex-wrap">
										{(["1D", "1W", "1M", "3M", "ALL"] as Timeframe[]).map((tf) => (
											<button
												key={tf}
												onClick={() => setSelectedTimeframe(tf)}
												className={cn(
													"px-2.5 py-1 text-xs rounded-md font-medium transition-colors",
													selectedTimeframe === tf
														? "bg-blue-600 text-white"
														: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
												)}
											>
												{tf}
											</button>
										))}
									</div>
								</div>
								{/* Ticker Filter */}
								<div className="flex items-center gap-2">
									<span className="text-xs text-zinc-400 font-medium whitespace-nowrap">
										Ticker
									</span>
									<select
										value={filteredSymbol}
										onChange={(e) => setFilteredSymbol(e.target.value)}
										className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
									>
										<option value="all">All</option>
										{uniqueSymbols.map((sym) => (
											<option key={sym} value={sym}>
												{sym}
											</option>
										))}
									</select>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* ── Portfolio Chart ── */}
					{portfolioHistory[selectedTimeframe] && (
						<div className="space-y-3">
							<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
								Portfolio Equity ·{" "}
								<span className="text-zinc-600 font-normal normal-case">
									{selectedTimeframe}
								</span>
							</h2>
							<PortfolioChart
								data={portfolioHistory[selectedTimeframe]}
								timeframe={selectedTimeframe}
							/>
						</div>
					)}

					{/* ── Portfolio Summary ── */}
					<div className="space-y-3">
						<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
							Portfolio Summary
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
							<Card>
								<CardContent className="p-4">
									<p className="text-xs text-zinc-500 mb-1">
										Starting Value <span className="text-zinc-600">({selectedTimeframe})</span>
									</p>
									<p className="text-xl font-bold text-zinc-50 tabular-nums">
										$
										{portfolioMetrics.startingValue.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<p className="text-xs text-zinc-500 mb-1">Current Value</p>
									<p className="text-xl font-bold text-zinc-50 tabular-nums">
										$
										{portfolioMetrics.currentValue.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<p className="text-xs text-zinc-500 mb-1">
										P&amp;L <span className="text-zinc-600">({selectedTimeframe})</span>
									</p>
									<p
										className={cn(
											"text-xl font-bold tabular-nums",
											portfolioMetrics.pnl >= 0 ? "text-emerald-400" : "text-red-400",
										)}
									>
										{portfolioMetrics.pnl >= 0 ? "+" : "-"}$
										{Math.abs(portfolioMetrics.pnl).toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<p className="text-xs text-zinc-500 mb-1">
										P&amp;L % <span className="text-zinc-600">({selectedTimeframe})</span>
									</p>
									<p
										className={cn(
											"text-xl font-bold tabular-nums",
											portfolioMetrics.pnlPercent >= 0 ? "text-emerald-400" : "text-red-400",
										)}
									>
										{portfolioMetrics.pnlPercent >= 0 ? "+" : ""}
										{(portfolioMetrics.pnlPercent * 100).toFixed(2)}%
									</p>
								</CardContent>
							</Card>
						</div>
					</div>

					{/* ── Risk-Adjusted Metrics ── */}
					<div className="space-y-3">
						<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
							Risk-Adjusted Performance
						</h2>
						<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-2 mb-2">
										<BarChart3 className="w-3.5 h-3.5 text-zinc-500" />
										<p className="text-xs text-zinc-500">Sharpe Ratio</p>
									</div>
									<p
										className={cn(
											"text-xl font-bold tabular-nums",
											portfolioMetrics.sharpeRatio >= 1
												? "text-emerald-400"
												: portfolioMetrics.sharpeRatio >= 0
													? "text-yellow-400"
													: "text-red-400",
										)}
									>
										{portfolioMetrics.sharpeRatio.toFixed(2)}
									</p>
									<p className="text-xs text-zinc-600 mt-1">
										{portfolioMetrics.sharpeRatio >= 2
											? "Excellent"
											: portfolioMetrics.sharpeRatio >= 1
												? "Good"
												: portfolioMetrics.sharpeRatio >= 0
													? "Fair"
													: "Poor"}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-2 mb-2">
										<Shield className="w-3.5 h-3.5 text-zinc-500" />
										<p className="text-xs text-zinc-500">Sortino Ratio</p>
									</div>
									<p
										className={cn(
											"text-xl font-bold tabular-nums",
											portfolioMetrics.sortinoRatio >= 1
												? "text-emerald-400"
												: portfolioMetrics.sortinoRatio >= 0
													? "text-yellow-400"
													: "text-red-400",
										)}
									>
										{portfolioMetrics.sortinoRatio.toFixed(2)}
									</p>
									<p className="text-xs text-zinc-600 mt-1">
										{portfolioMetrics.sortinoRatio >= 2
											? "Excellent"
											: portfolioMetrics.sortinoRatio >= 1
												? "Good"
												: portfolioMetrics.sortinoRatio >= 0
													? "Fair"
													: "Poor"}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-2 mb-2">
										<TrendingDown className="w-3.5 h-3.5 text-zinc-500" />
										<p className="text-xs text-zinc-500">Max Drawdown</p>
									</div>
									<p
										className={cn(
											"text-xl font-bold tabular-nums",
											portfolioMetrics.maxDrawdown <= 0.1
												? "text-emerald-400"
												: portfolioMetrics.maxDrawdown <= 0.2
													? "text-yellow-400"
													: "text-red-400",
										)}
									>
										-{(portfolioMetrics.maxDrawdown * 100).toFixed(2)}%
									</p>
									<p className="text-xs text-zinc-600 mt-1">
										{portfolioMetrics.maxDrawdown <= 0.1
											? "Low Risk"
											: portfolioMetrics.maxDrawdown <= 0.2
												? "Moderate"
												: portfolioMetrics.maxDrawdown <= 0.3
													? "High"
													: "Very High"}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-2 mb-2">
										<Target className="w-3.5 h-3.5 text-zinc-500" />
										<p className="text-xs text-zinc-500">Calmar Ratio</p>
									</div>
									<p
										className={cn(
											"text-xl font-bold tabular-nums",
											portfolioMetrics.calmarRatio >= 3
												? "text-emerald-400"
												: portfolioMetrics.calmarRatio >= 0
													? "text-yellow-400"
													: "text-red-400",
										)}
									>
										{portfolioMetrics.calmarRatio.toFixed(2)}
									</p>
									<p className="text-xs text-zinc-600 mt-1">
										{portfolioMetrics.calmarRatio >= 3
											? "Excellent"
											: portfolioMetrics.calmarRatio >= 1
												? "Good"
												: portfolioMetrics.calmarRatio >= 0
													? "Fair"
													: "Poor"}
									</p>
								</CardContent>
							</Card>
						</div>
					</div>

					{/* ── Closed Positions Summary ── */}
					<div className="space-y-3">
						<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
							Closed Positions Summary
						</h2>
						<div className="grid grid-cols-2 gap-3">
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-2 mb-2">
										<Activity className="w-3.5 h-3.5 text-zinc-500" />
										<p className="text-xs text-zinc-500">Total Trades</p>
									</div>
									<p className="text-2xl font-bold text-zinc-50 tabular-nums">
										{metrics.totalTrades}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-2 mb-2">
										<TrendingUp className="w-3.5 h-3.5 text-zinc-500" />
										<p className="text-xs text-zinc-500">Win Rate</p>
									</div>
									<p className="text-2xl font-bold text-zinc-50 tabular-nums">
										{metrics.winRate.toFixed(1)}%
									</p>
								</CardContent>
							</Card>
						</div>
					</div>

					{/* ── Active Positions ── */}
					<div className="space-y-3">
						<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
							Active Positions
						</h2>
						<ActivePositions positions={positions} getUnderlyingTicker={getUnderlyingTicker} />
					</div>

					{/* ── Trade History ── */}
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
								Trade History
								<span className="normal-case font-normal text-zinc-600 ml-2">
									({selectedTimeframe})
								</span>
							</h2>
							<span className="text-xs text-zinc-600">
								{sortedTrades.length} of {metrics.totalTrades} trades
							</span>
						</div>
						<TradesTable
							trades={sortedTrades}
							onSort={handleSort}
							sortConfig={sortConfig}
							metrics={metrics}
						/>
					</div>
				</div>
			</main>
		</div>
	);
}
