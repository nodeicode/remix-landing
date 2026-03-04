import React from "react";
import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { cn } from "../lib/utils";

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

interface ActivePositionsProps {
	positions: Position[];
	getUnderlyingTicker: (symbol: string) => string;
}

// Parse option symbol to human-readable label
// Format: AAPL250117C00150000 → AAPL Jan 17 '25 $150 Call
function parseOptionLabel(symbol: string): string {
	const m = symbol.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
	if (!m) return symbol;
	const [, , yy, mm, dd, cp, strike] = m;
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const monthName = months[parseInt(mm, 10) - 1];
	const strikeVal = (parseInt(strike, 10) / 1000).toFixed(0);
	const type = cp === "C" ? "Call" : "Put";
	return `${monthName} ${parseInt(dd, 10)} '${yy} $${strikeVal} ${type}`;
}

function PlTag({ value }: { value: number }) {
	const isPos = value > 0;
	const isZero = value === 0;
	if (isZero) return <span className="text-zinc-500 font-semibold text-sm">$0.00</span>;
	return (
		<span className={cn("font-semibold text-sm", isPos ? "text-emerald-400" : "text-red-400")}>
			{isPos ? "+" : ""}$
			{value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
		</span>
	);
}

function PlPctTag({ value }: { value: number }) {
	const isPos = value >= 0;
	const icon = isPos ? (
		<TrendingUp className="w-3 h-3 text-emerald-400" />
	) : (
		<TrendingDown className="w-3 h-3 text-red-400" />
	);
	return (
		<span
			className={cn(
				"flex items-center gap-1 font-semibold text-xs",
				isPos ? "text-emerald-400" : "text-red-400",
			)}
		>
			{icon}
			{isPos ? "+" : ""}
			{value.toFixed(2)}%
		</span>
	);
}

export function ActivePositions({ positions, getUnderlyingTicker }: ActivePositionsProps) {
	// Group positions by underlying ticker
	const groups = useMemo(() => {
		const map = new Map<string, Position[]>();
		for (const pos of positions) {
			const ticker = getUnderlyingTicker(pos.symbol);
			if (!map.has(ticker)) map.set(ticker, []);
			map.get(ticker)!.push(pos);
		}
		return map;
	}, [positions, getUnderlyingTicker]);

	// Start all groups collapsed
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

	const toggleGroup = (ticker: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(ticker)) next.delete(ticker);
			else next.add(ticker);
			return next;
		});
	};

	if (positions.length === 0) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center py-12">
					<p className="text-zinc-500 text-sm">No active positions</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent className="p-0">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						{/* Header */}
						<thead>
							<tr className="border-b border-zinc-800">
								<th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 w-8" />
								<th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">
									Ticker / Leg
								</th>
								<th className="text-right px-4 py-3 text-xs font-medium text-zinc-400">Qty</th>
								<th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 hidden sm:table-cell">
									Avg Entry
								</th>
								<th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 hidden sm:table-cell">
									Last
								</th>
								<th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 hidden md:table-cell">
									Mkt Value
								</th>
								<th className="text-right px-4 py-3 text-xs font-medium text-zinc-400">
									Unr. P&amp;L
								</th>
								<th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 pr-6">
									P&amp;L %
								</th>
							</tr>
						</thead>
						<tbody>
							{Array.from(groups.entries()).map(([ticker, legs]) => {
								const isExpanded = expandedGroups.has(ticker);
								const multiLeg = legs.length > 1;

								// Aggregate metrics for the group header
								const totalPl = legs.reduce((s, p) => s + parseFloat(p.unrealized_pl), 0);
								const totalMv = legs.reduce((s, p) => s + parseFloat(p.market_value), 0);
								const totalCost = legs.reduce((s, p) => s + parseFloat(p.cost_basis), 0);
								const totalPlPct = totalCost !== 0 ? (totalPl / Math.abs(totalCost)) * 100 : 0;

								// Single-position groups: render a flat data row (no dropdown)
								if (!multiLeg) {
									const pos = legs[0];
									const isOption = getUnderlyingTicker(pos.symbol) !== pos.symbol;
									const unrealizedPl = parseFloat(pos.unrealized_pl);
									const unrealizedPlpc = parseFloat(pos.unrealized_plpc) * 100;
									return (
										<tr
											key={`flat-${pos.asset_id}`}
											className="border-b border-zinc-800/60 hover:bg-zinc-900/50 transition-colors"
										>
											<td className="px-4 py-3" />
											<td className="px-4 py-3">
												<div className="flex flex-col gap-0.5">
													{isOption ? (
														<>
															<span className="text-zinc-300 text-xs font-mono leading-tight">
																{parseOptionLabel(pos.symbol)}
															</span>
															<span className="text-zinc-600 text-[10px] font-mono">
																{pos.symbol}
															</span>
														</>
													) : (
														<span className="text-zinc-200 text-sm font-bold">{ticker}</span>
													)}
												</div>
											</td>
											<td className="px-4 py-3 text-right text-zinc-300 text-xs tabular-nums">
												{parseFloat(pos.qty).toLocaleString()}
											</td>
											<td className="px-4 py-3 text-right text-zinc-300 text-xs tabular-nums hidden sm:table-cell">
												${parseFloat(pos.avg_entry_price).toFixed(2)}
											</td>
											<td className="px-4 py-3 text-right text-zinc-300 text-xs tabular-nums hidden sm:table-cell">
												${parseFloat(pos.current_price).toFixed(2)}
											</td>
											<td className="px-4 py-3 text-right text-zinc-300 text-xs tabular-nums hidden md:table-cell">
												$
												{parseFloat(pos.market_value).toLocaleString(undefined, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</td>
											<td className="px-4 py-3 text-right">
												<PlTag value={unrealizedPl} />
											</td>
											<td className="px-4 py-3 text-right pr-6">
												<div className="flex justify-end">
													{unrealizedPl === 0 ? (
														<span className="text-zinc-500 flex items-center gap-1 text-xs">
															<Minus className="w-3 h-3" />
															0.00%
														</span>
													) : (
														<PlPctTag value={unrealizedPlpc} />
													)}
												</div>
											</td>
										</tr>
									);
								}

								return (
									<React.Fragment key={`group-${ticker}`}>
										{/* ── Group header row ── */}
										<tr
											onClick={() => toggleGroup(ticker)}
											className="border-b border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-800/40 cursor-pointer select-none"
										>
											<td className="px-4 py-3 text-zinc-500">
												{isExpanded ? (
													<ChevronDown className="w-4 h-4" />
												) : (
													<ChevronRight className="w-4 h-4" />
												)}
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center gap-2">
													<span className="font-bold text-zinc-50 text-sm">{ticker}</span>
													{multiLeg && (
														<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
															{legs.length} legs
														</span>
													)}
												</div>
											</td>
											<td className="px-4 py-3 text-right text-zinc-500 text-xs">—</td>
											<td className="px-4 py-3 text-right hidden sm:table-cell text-zinc-500 text-xs">
												—
											</td>
											<td className="px-4 py-3 text-right hidden sm:table-cell text-zinc-500 text-xs">
												—
											</td>
											<td className="px-4 py-3 text-right hidden md:table-cell">
												<span className="text-zinc-300 text-xs tabular-nums">
													$
													{totalMv.toLocaleString(undefined, {
														minimumFractionDigits: 2,
														maximumFractionDigits: 2,
													})}
												</span>
											</td>
											<td className="px-4 py-3 text-right">
												<PlTag value={totalPl} />
											</td>
											<td className="px-4 py-3 text-right pr-6">
												<div className="flex justify-end">
													<PlPctTag value={totalPlPct} />
												</div>
											</td>
										</tr>

										{/* ── Individual legs (shown when expanded) ── */}
										{isExpanded &&
											legs.map((position) => {
												const isOption =
													getUnderlyingTicker(position.symbol) !== position.symbol;
												const unrealizedPl = parseFloat(position.unrealized_pl);
												const unrealizedPlpc = parseFloat(position.unrealized_plpc) * 100;

												return (
													<tr
														key={position.asset_id}
														className="border-b border-zinc-800/30 hover:bg-zinc-900/50 transition-colors"
													>
														<td className="px-4 py-2.5" />
														<td className="px-4 py-2.5 pl-8">
															<div className="flex flex-col gap-0.5">
																{isOption ? (
																	<>
																		<span className="text-zinc-300 text-xs font-mono leading-tight">
																			{parseOptionLabel(position.symbol)}
																		</span>
																		<span className="text-zinc-600 text-[10px] font-mono">
																			{position.symbol}
																		</span>
																	</>
																) : (
																	<span className="text-zinc-200 text-sm font-semibold">
																		{ticker}
																	</span>
																)}
															</div>
														</td>
														<td className="px-4 py-2.5 text-right text-zinc-300 text-xs tabular-nums">
															{parseFloat(position.qty).toLocaleString()}
														</td>
														<td className="px-4 py-2.5 text-right text-zinc-300 text-xs tabular-nums hidden sm:table-cell">
															${parseFloat(position.avg_entry_price).toFixed(isOption ? 2 : 2)}
														</td>
														<td className="px-4 py-2.5 text-right text-zinc-300 text-xs tabular-nums hidden sm:table-cell">
															${parseFloat(position.current_price).toFixed(2)}
														</td>
														<td className="px-4 py-2.5 text-right text-zinc-300 text-xs tabular-nums hidden md:table-cell">
															$
															{parseFloat(position.market_value).toLocaleString(undefined, {
																minimumFractionDigits: 2,
																maximumFractionDigits: 2,
															})}
														</td>
														<td className="px-4 py-2.5 text-right">
															<PlTag value={unrealizedPl} />
														</td>
														<td className="px-4 py-2.5 text-right pr-6">
															<div className="flex justify-end">
																{unrealizedPl === 0 ? (
																	<span className="text-zinc-500 flex items-center gap-1 text-xs">
																		<Minus className="w-3 h-3" />
																		0.00%
																	</span>
																) : (
																	<PlPctTag value={unrealizedPlpc} />
																)}
															</div>
														</td>
													</tr>
												);
											})}
									</React.Fragment>
								);
							})}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}
