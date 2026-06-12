import { useState, useMemo, useEffect, useCallback } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { registerServiceWorker, subscribeToNotifications } from "~/utils/service-worker";
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
	Loader2,
	Zap,
	CalendarIcon,
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
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { cn } from "../lib/utils";
import { PortfolioChart } from "../components/portfolio-chart";
import { SignalsTimeline } from "../components/signals-timeline";
import { ConfigCard } from "../components/config-card";

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

type Preset = "1D" | "1W" | "1M" | "3M" | "ALL";

function getDateRangeBounds(
	preset: Preset | null,
	range: DateRange | undefined,
): { start: Date; end: Date } {
	const now = new Date();
	if (preset) {
		const start = new Date();
		switch (preset) {
			case "1D":
				start.setDate(now.getDate() - 1);
				break;
			case "1W":
				start.setDate(now.getDate() - 7);
				break;
			case "1M":
				start.setMonth(now.getMonth() - 1);
				break;
			case "3M":
				start.setMonth(now.getMonth() - 3);
				break;
			case "ALL":
				return { start: new Date(0), end: now };
		}
		return { start, end: now };
	}
	if (range?.from) {
		const end = range.to
			? new Date(new Date(range.to).setHours(23, 59, 59, 999))
			: new Date(new Date(range.from).setHours(23, 59, 59, 999));
		return { start: range.from, end };
	}
	const fallback = new Date();
	fallback.setDate(now.getDate() - 7);
	return { start: fallback, end: now };
}

function getRangeLabel(preset: Preset | null, range: DateRange | undefined): string {
	if (preset) return preset;
	if (range?.from) {
		return range.to
			? `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`
			: format(range.from, "MMM d, yyyy");
	}
	return "Custom";
}

function getAnnualizationParams(
	preset: Preset | null,
	range: DateRange | undefined,
): { factor: number; periodsPerYear: number } {
	if (preset === "1D") return { factor: Math.sqrt(252), periodsPerYear: 252 };
	if (preset === "1W") return { factor: Math.sqrt(52), periodsPerYear: 52 };
	if (preset === "1M") return { factor: Math.sqrt(12), periodsPerYear: 12 };
	if (preset === "3M") return { factor: Math.sqrt(4), periodsPerYear: 4 };
	if (preset === "ALL") return { factor: Math.sqrt(252), periodsPerYear: 1 };

	const { start, end } = getDateRangeBounds(null, range);
	const days = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000);
	if (days <= 1) return { factor: Math.sqrt(252), periodsPerYear: 252 };
	if (days <= 7) return { factor: Math.sqrt(52), periodsPerYear: 52 };
	if (days <= 31) return { factor: Math.sqrt(12), periodsPerYear: 12 };
	if (days <= 93) return { factor: Math.sqrt(4), periodsPerYear: 4 };
	return { factor: Math.sqrt(365 / days), periodsPerYear: 365 / days };
}

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
	orderIdToSource: Record<string, string>;
	cashFlows?: { time: number; amount: number }[];
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
	const [selectedAccountId, setSelectedAccountId] = useState<string>("");

	const getDefaultAccountId = (accountList: AccountData[]): string => {
		if (accountList.length === 0) return "";
		const preferredDefault = accountList.find((account) => account.id === "additional-0");
		return preferredDefault?.id ?? accountList[0].id;
	};

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
			setSelectedAccountId((prevSelectedId) => {
				if (
					prevSelectedId &&
					data.accounts.some((account: AccountData) => account.id === prevSelectedId)
				) {
					return prevSelectedId;
				}
				return getDefaultAccountId(data.accounts);
			});
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

	const currentAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

	// Destructure from the currently selected account
	const { portfolioHistory, positions, activities, legToParentOrder, orderIdToSource } =
		currentAccount || {
			portfolioHistory: {},
			positions: [],
			activities: [],
			legToParentOrder: {},
			orderIdToSource: {},
		};

	const [activeTab, setActiveTab] = useState<"portfolio" | "signals">("signals");
	const [filteredSymbol, setFilteredSymbol] = useState<string>("all");
	const [preset, setPreset] = useState<Preset | null>("1W");
	const [customRange, setCustomRange] = useState<DateRange | undefined>();
	const [calOpen, setCalOpen] = useState(false);
	const [customHistory, setCustomHistory] = useState<PortfolioHistoryData | null>(null);
	const [customHistoryLoading, setCustomHistoryLoading] = useState(false);
	const [customHistoryError, setCustomHistoryError] = useState<string | null>(null);
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

	// Unregister, re-register and re-subscribe — useful when the push subscription breaks.
	const resetServiceWorker = async () => {
		setIsResetting(true);
		try {
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const reg of registrations) await reg.unregister();
			await registerServiceWorker();
			if (Notification.permission === "granted") await subscribeToNotifications();
			alert("Service worker reset successfully! Page will reload...");
			window.location.reload();
		} catch (err) {
			console.error("[Dashboard] Reset failed:", err);
			alert("Failed to reset service worker.");
		} finally {
			setIsResetting(false);
		}
	};

	// Register SW on mount; subscription is handled by NotificationPermission component.
	useEffect(() => {
		registerServiceWorker();
	}, []);

	const rangeLabel = getRangeLabel(preset, customRange);
	const dateBounds = useMemo(
		() => getDateRangeBounds(preset, customRange),
		[preset, customRange],
	);

	const activeHistory = preset ? portfolioHistory[preset] : customHistory;

	// Fetch portfolio history for custom date ranges
	useEffect(() => {
		if (preset || !customRange?.from || !customRange?.to || !selectedAccountId) {
			setCustomHistory(null);
			setCustomHistoryError(null);
			return;
		}

		const controller = new AbortController();
		const { start, end } = getDateRangeBounds(null, customRange);

		setCustomHistoryLoading(true);
		setCustomHistoryError(null);

		fetch(
			`/api/portfolio-history?accountId=${encodeURIComponent(selectedAccountId)}&startMs=${start.getTime()}&endMs=${end.getTime()}`,
			{ signal: controller.signal },
		)
			.then(async (res) => {
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					throw new Error(body.error ?? `HTTP ${res.status}`);
				}
				return res.json() as Promise<{ history: PortfolioHistoryData }>;
			})
			.then((data) => {
				setCustomHistory(data.history);
			})
			.catch((err) => {
				if (err instanceof DOMException && err.name === "AbortError") return;
				setCustomHistory(null);
				setCustomHistoryError(
					err instanceof Error ? err.message : "Failed to load portfolio history",
				);
			})
			.finally(() => {
				if (!controller.signal.aborted) setCustomHistoryLoading(false);
			});

		return () => controller.abort();
	}, [preset, customRange, selectedAccountId]);

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

	// Map each fill / expiration activity directly to a trade row.
	// No FIFO matching — just show raw cash flows and group MLEG orders.
	const tradeHistory = useMemo(() => {
		return activities
			.map((activity) => {
				const isOption = /^[A-Z]+\d{6}[CP]/.test(activity.symbol);
				const multiplier = isOption ? 100 : 1;
				const price = parseFloat(activity.price);
				const qty = parseFloat(activity.qty);
				const value = price * qty * multiplier;
				const resolvedOrderId =
					legToParentOrder[activity.order_id] || activity.order_id || undefined;

				let side: "buy" | "sell" | "expired";
				let cashFlow: number;

				if (activity.activity_type === "OPEXP") {
					side = "expired";
					cashFlow = 0;
				} else if (activity.side.startsWith("sell")) {
					// Covers "sell", "sell_short", "sell_to_close"
					side = "sell";
					cashFlow = value;
				} else {
					// Covers "buy", "buy_to_cover", "buy_to_close"
					side = "buy";
					cashFlow = -value;
				}

				return {
					id: activity.id,
					date: new Date(activity.transaction_time),
					symbol: activity.symbol,
					underlyingTicker: getUnderlyingTicker(activity.symbol),
					quantity: qty,
					side,
					price,
					cashFlow,
					orderId: resolvedOrderId,
					source: resolvedOrderId
						? (orderIdToSource[resolvedOrderId] ?? orderIdToSource[activity.order_id])
						: orderIdToSource[activity.order_id],
				};
			})
			.sort((a, b) => b.date.getTime() - a.date.getTime());
	}, [activities, legToParentOrder, orderIdToSource]);

	// Filter trades by underlying ticker and timeframe
	const filteredTrades = useMemo(() => {
		let filtered = tradeHistory;

		// Filter by ticker
		if (filteredSymbol !== "all") {
			filtered = filtered.filter((trade) => trade.underlyingTicker === filteredSymbol);
		}

		// Filter by date range
		if (preset !== "ALL") {
			const { start, end } = dateBounds;
			filtered = filtered.filter((trade) => trade.date >= start && trade.date <= end);
		}

		return filtered;
	}, [tradeHistory, filteredSymbol, preset, dateBounds]);
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
		const winningTrades = tradeHistory.filter((trade) => trade.cashFlow > 0).length;
		const totalTrades = tradeHistory.length;
		const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
		const netRealizedPnl = tradeHistory.reduce((sum, t) => sum + t.cashFlow, 0);
		const nonZeroTrades = tradeHistory.filter((t) => t.cashFlow !== 0);
		const avgFill =
			nonZeroTrades.length > 0
				? nonZeroTrades.reduce((sum, t) => sum + Math.abs(t.cashFlow), 0) /
					nonZeroTrades.length
				: 0;

		return {
			winRate,
			totalTrades,
			netRealizedPnl,
			avgFill,
		};
	}, [tradeHistory]);

	// Portfolio summary uses flow-adjusted equity (trading-only, same as the chart).
	// Raw account balance is shown in the sidebar via currentAccount.equity.
	const portfolioMetrics = useMemo(() => {
		const historyData = activeHistory;
		const rawLiveEquity = currentAccount?.equity ?? 0;

		if (!historyData || !historyData.equity || historyData.equity.length === 0) {
			return {
				startingValue: 0,
				currentValue: rawLiveEquity,
				pnl: 0,
				pnlPercent: 0,
				sharpeRatio: 0,
				sortinoRatio: 0,
				maxDrawdown: 0,
				calmarRatio: 0,
			};
		}

		const lastIdx = historyData.equity.length - 1;
		const startingValue = historyData.base_value;
		const currentValue = historyData.equity[lastIdx] ?? 0;
		const pnl = currentValue - startingValue;
		const pnlPercent = startingValue !== 0 ? pnl / startingValue : 0;

		const validEquities = historyData.equity.filter((e) => e != null && e > 0);
		const returns: number[] = [];
		for (let i = 1; i < validEquities.length; i++) {
			const ret = (validEquities[i] - validEquities[i - 1]) / validEquities[i - 1];
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

		const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

		const variance =
			returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
		const stdDev = Math.sqrt(variance);

		const { factor: annualizationFactor, periodsPerYear } = getAnnualizationParams(
			preset,
			customRange,
		);
		const sharpeRatio = stdDev !== 0 ? (meanReturn / stdDev) * annualizationFactor : 0;

		const downsideReturns = returns.filter((r) => r < 0);
		const downsideVariance =
			downsideReturns.length > 0
				? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
				: 0;
		const downsideStdDev = Math.sqrt(downsideVariance);
		const sortinoRatio =
			downsideStdDev !== 0 ? (meanReturn / downsideStdDev) * annualizationFactor : 0;

		let peak = validEquities[0] ?? 0;
		let maxDrawdown = 0;
		for (const equity of validEquities) {
			if (equity > peak) {
				peak = equity;
			}
			const drawdown = (peak - equity) / peak;
			if (drawdown > maxDrawdown) {
				maxDrawdown = drawdown;
			}
		}

		const annualizedReturn = pnlPercent * periodsPerYear;
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
	}, [activeHistory, preset, customRange, currentAccount?.equity]);

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

				{/* Nav */}
				<div className="px-3 pt-4 pb-2">
					<p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-1">
						Navigate
					</p>
					<div className="flex flex-col gap-1">
						<button
							onClick={() => {
								setActiveTab("signals");
								setIsSidebarOpen(false);
							}}
							className={cn(
								"w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
								activeTab === "signals"
									? "bg-zinc-800 text-zinc-100"
									: "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
							)}
						>
							<Zap className="w-3.5 h-3.5" />
							Logs
						</button>
					</div>
				</div>

				{/* Account switcher */}
				<div className="px-3 pt-4 pb-2 border-t border-zinc-800">
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
									onClick={() => {
										setSelectedAccountId(account.id);
										setActiveTab("portfolio");
										setIsSidebarOpen(false);
									}}
									className={cn(
										"w-full text-left rounded-lg px-3 py-2.5 transition-all border",
										isSelected && activeTab === "portfolio"
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

				{/* Live pulse */}
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
							<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
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
							<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
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
			<main className="flex-1 overflow-y-auto flex flex-col min-w-0" key={activeTab}>
				{/* ── Sticky header: mobile nav + timeframe/ticker toolbar ── */}
				<div className="sticky top-0 z-10 flex-none bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/70">
					{/* Mobile top bar */}
					<div className="sm:hidden flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60">
						<button
							onClick={() => setIsSidebarOpen(!isSidebarOpen)}
							className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
						>
							{isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
						</button>
						<h1 className="text-sm font-bold text-zinc-50 truncate">
							{activeTab === "signals" ? "Logs" : "Portfolio"}
						</h1>
						{lastUpdated && (
							<span className="ml-auto text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">
								{lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
							</span>
						)}
					</div>
					{/* Toolbar — portfolio only */}
					{activeTab === "portfolio" && (
						<div className="px-3 sm:px-5 py-2.5">
							<div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
								{/* Date range */}
								<div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
									<span className="text-xs text-zinc-400 font-medium whitespace-nowrap">
										Range
									</span>
									<div className="flex gap-1 flex-wrap">
										{(["1D", "1W", "1M", "3M", "ALL"] as Preset[]).map((tf) => (
											<button
												key={tf}
												onClick={() => {
													setPreset(tf);
													setCustomRange(undefined);
												}}
												className={cn(
													"px-2.5 py-1 text-xs rounded-md font-medium transition-colors",
													preset === tf
														? "bg-blue-600 text-white"
														: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
												)}
											>
												{tf}
											</button>
										))}
									</div>
									<Popover open={calOpen} onOpenChange={setCalOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												size="sm"
												className={cn(
													"h-7 text-xs gap-1.5",
													!preset && "ring-1 ring-blue-500 border-blue-500",
												)}
											>
												<CalendarIcon className="w-3 h-3" />
												{preset ? "Custom" : rangeLabel}
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-auto p-0" align="start">
											<Calendar
												mode="range"
												selected={customRange}
												onSelect={(r) => {
													setCustomRange(r);
													setPreset(null);
													if (r?.from && r?.to) setCalOpen(false);
												}}
												toDate={new Date()}
												numberOfMonths={2}
											/>
										</PopoverContent>
									</Popover>
								</div>
								{/* Ticker Filter */}
								<div className="flex items-center gap-2">
									<span className="text-xs text-zinc-400 font-medium whitespace-nowrap">
										Ticker
									</span>
									<Select value={filteredSymbol} onValueChange={setFilteredSymbol}>
										<SelectTrigger className="w-28">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All</SelectItem>
											{uniqueSymbols.map((sym) => (
												<SelectItem key={sym} value={sym}>
													{sym}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>
					)}
				</div>
				{/* ── Logs tab ── */}
				{activeTab === "signals" && (
					<div className="max-w-6xl mx-auto w-full p-3 sm:p-5 pb-12 space-y-4 sm:space-y-6">
						<ConfigCard />
						<SignalsTimeline />
					</div>
				)}
				{/* ── Portfolio tab ── */}
				{activeTab === "portfolio" && (
					<div className="max-w-6xl mx-auto w-full p-3 sm:p-5 pb-12 space-y-4 sm:space-y-6">
						{/* ── Portfolio Chart ── */}
						<div className="space-y-3">
							<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
								Portfolio Equity ·{" "}
								<span className="text-zinc-600 font-normal normal-case">{rangeLabel}</span>
							</h2>
							{customHistoryError && (
								<div className="rounded-md border border-red-900/50 bg-red-950/20 px-4 py-3 text-xs text-red-400">
									{customHistoryError}
								</div>
							)}
							{customHistoryLoading ? (
								<div className="flex items-center justify-center h-48 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 text-sm gap-2">
									<Loader2 className="w-4 h-4 animate-spin" />
									Loading portfolio history…
								</div>
							) : activeHistory ? (
								<PortfolioChart
									data={activeHistory}
									rangeDays={
										(dateBounds.end.getTime() - dateBounds.start.getTime()) / 86_400_000
									}
								/>
							) : (
								<div className="flex items-center justify-center h-48 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 text-sm">
									{!preset && customRange?.from && !customRange?.to
										? "Select an end date to load the chart"
										: "No data available for this range"}
								</div>
							)}
						</div>

						{/* ── Portfolio Summary ── */}
						<div className="space-y-3">
							<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
								Portfolio Summary
							</h2>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
								<Card>
									<CardContent className="p-4">
										<p className="text-xs text-zinc-500 mb-1">
											Starting Value{" "}
											<span className="text-zinc-600">({rangeLabel})</span>
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
											P&amp;L <span className="text-zinc-600">({rangeLabel})</span>
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
											P&amp;L % <span className="text-zinc-600">({rangeLabel})</span>
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
							<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
										<p
											className={cn(
												"text-2xl font-bold tabular-nums",
												metrics.winRate >= 50
													? "text-emerald-400"
													: metrics.winRate >= 30
														? "text-yellow-400"
														: "text-red-400",
											)}
										>
											{metrics.winRate.toFixed(1)}%
										</p>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-4">
										<div className="flex items-center gap-2 mb-2">
											<BarChart3 className="w-3.5 h-3.5 text-zinc-500" />
											<p className="text-xs text-zinc-500">Net Realized P&amp;L</p>
										</div>
										<p
											className={cn(
												"text-2xl font-bold tabular-nums",
												metrics.netRealizedPnl >= 0 ? "text-emerald-400" : "text-red-400",
											)}
										>
											{metrics.netRealizedPnl >= 0 ? "+" : "-"}$
											{Math.abs(metrics.netRealizedPnl).toLocaleString(undefined, {
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											})}
										</p>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-4">
										<div className="flex items-center gap-2 mb-2">
											<Target className="w-3.5 h-3.5 text-zinc-500" />
											<p className="text-xs text-zinc-500">Avg Fill</p>
										</div>
										<p className="text-2xl font-bold text-zinc-50 tabular-nums">
											$
											{metrics.avgFill.toLocaleString(undefined, {
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											})}
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
							<ActivePositions
								positions={positions}
								getUnderlyingTicker={getUnderlyingTicker}
							/>
						</div>

						{/* ── Trade History ── */}
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
									Trade History
									<span className="normal-case font-normal text-zinc-600 ml-2">
										({rangeLabel})
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
				)}
			</main>
		</div>
	);
}
