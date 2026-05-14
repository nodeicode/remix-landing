import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "./ui/chart";
import { cn } from "../lib/utils";

interface PortfolioChartProps {
	data: {
		timestamp: number[];
		equity: number[];
		profit_loss: number[];
		profit_loss_pct: number[];
		base_value: number;
		timeframe: string;
	};
	timeframe: string;
}

function formatDate(timestamp: number, timeframe: string): string {
	const date = new Date(timestamp * 1000);
	if (timeframe === "1D") {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	} else if (timeframe === "1W") {
		return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
	} else {
		return date.toLocaleDateString([], { month: "short", day: "numeric" });
	}
}

export function PortfolioChart({ data, timeframe }: PortfolioChartProps) {
	if (!data || !data.timestamp || data.timestamp.length === 0) {
		return (
			<div className="flex items-center justify-center h-48 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 text-sm">
				No data available for this timeframe
			</div>
		);
	}

	// eslint-disable-next-line react-hooks/rules-of-hooks
	const chartData = useMemo(() => {
		return data.timestamp.map((ts, i) => ({
			date: ts,
			equity: data.equity[i] ?? 0,
			profit_loss: data.profit_loss[i] ?? 0,
			profit_loss_pct: data.profit_loss_pct[i] ?? 0,
		}));
	}, [data]);

	// Use Alpaca's own profit_loss/profit_loss_pct from the last data point.
	// The api.accounts loader already patches that last point with live equity.
	const lastIdx = data.equity.length - 1;
	const currentEquity = data.equity[lastIdx] ?? 0;
	const startEquity = data.base_value;
	const change = data.profit_loss[lastIdx] ?? currentEquity - startEquity;
	const changePct = (data.profit_loss_pct[lastIdx] ?? 0) * 100;
	const isPositive = change >= 0;
	const lineColor = isPositive ? "#34d399" : "#f87171";

	const chartConfig: ChartConfig = {
		equity: { label: "Equity", color: lineColor },
	};

	const tickCount = timeframe === "1D" ? 6 : timeframe === "1W" ? 7 : 5;
	const step = Math.max(1, Math.floor(chartData.length / tickCount));
	const tickTimestamps = chartData.filter((_, i) => i % step === 0).map((d) => d.date);

	return (
		<div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
			{/* Header metrics */}
			<div className="flex items-start justify-between gap-4 flex-wrap">
				<div>
					<p className="text-xs text-zinc-500 mb-0.5">Portfolio Value</p>
					<p className="text-2xl font-bold text-zinc-50 tabular-nums">
						$
						{currentEquity.toLocaleString(undefined, {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						})}
					</p>
				</div>
				<div
					className={cn(
						"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold",
						isPositive ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400",
					)}
				>
					{isPositive ? (
						<TrendingUp className="w-4 h-4" />
					) : (
						<TrendingDown className="w-4 h-4" />
					)}
					<span>
						{isPositive ? "+" : ""}$
						{Math.abs(change).toLocaleString(undefined, {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						})}{" "}
						({isPositive ? "+" : ""}
						{changePct.toFixed(2)}%)
					</span>
				</div>
			</div>

			{/* Chart */}
			<ChartContainer config={chartConfig} className="h-56 w-full">
				<AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
					<defs>
						<linearGradient id="gradEquity" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor={lineColor} stopOpacity={0.25} />
							<stop offset="95%" stopColor={lineColor} stopOpacity={0.02} />
						</linearGradient>
					</defs>

					<CartesianGrid
						vertical={false}
						stroke="#3f3f46"
						strokeDasharray="3 3"
						strokeOpacity={0.5}
					/>

					<XAxis
						dataKey="date"
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						ticks={tickTimestamps}
						tickFormatter={(v) => formatDate(v, timeframe)}
						tick={{ fill: "#71717a", fontSize: 11 }}
					/>

					<YAxis
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						width={72}
						tickFormatter={(v: number) =>
							`$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
						}
						tick={{ fill: "#71717a", fontSize: 11 }}
						domain={["auto", "auto"]}
					/>

					<ReferenceLine y={data.base_value} strokeDasharray="4 4" strokeWidth={1} />

					<ChartTooltip
						cursor={{ stroke: "#52525b", strokeWidth: 1 }}
						content={
							<ChartTooltipContent
								labelFormatter={(_label, payload) => {
									if (payload?.[0]?.payload?.date) {
										return formatDate(payload[0].payload.date as number, timeframe);
									}
									return "";
								}}
								formatter={(value, _name, item) => {
									const v = Number(value);
									const pl: number = (item.payload?.profit_loss as number) ?? 0;
									const plPct: number = (item.payload?.profit_loss_pct as number) ?? 0;
									const plPos = pl >= 0;
									return (
										<>
											<span className="text-zinc-400 mr-2">Equity</span>
											<span className="font-mono font-semibold text-zinc-50 tabular-nums">
												$
												{v.toLocaleString(undefined, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</span>
											<div
												className={cn(
													"mt-1 text-xs font-mono tabular-nums",
													plPos ? "text-emerald-400" : "text-red-400",
												)}
											>
												{plPos ? "+" : ""}$
												{Math.abs(pl).toLocaleString(undefined, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}{" "}
												({plPos ? "+" : ""}
												{(plPct * 100).toFixed(2)}%)
											</div>
										</>
									);
								}}
							/>
						}
					/>

					<Area
						type="monotone"
						dataKey="equity"
						stroke={lineColor}
						strokeWidth={2}
						fill="url(#gradEquity)"
						dot={false}
						activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
						isAnimationActive={false}
					/>
				</AreaChart>
			</ChartContainer>
		</div>
	);
}
