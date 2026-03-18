import React, { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Card, CardContent } from "./ui/card";
import { cn } from "../lib/utils";

interface Trade {
	id: string;
	date: Date;
	symbol: string;
	underlyingTicker: string;
	quantity: number;
	buyPrice: number;
	sellPrice: number;
	buyValue: number;
	sellValue: number;
	pnl: number;
	pnlPercent: number;
	orderId?: string;
}

interface TradesTableProps {
	trades: Trade[];
	onSort: (key: string) => void;
	sortConfig: { key: string; direction: "asc" | "desc" } | null;
	metrics: {
		winRate: number;
		totalTrades: number;
	};
}

// ─── Group trades strictly by orderId (no strategy inference) ───────────────

interface TradeGroup {
	key: string;
	/** e.g. "AAPL" for single-leg or "AAPL — 3 Legs" for multi-leg */
	label: string;
	trades: Trade[];
	isMultiLeg: boolean;
	totalPnl: number;
	totalPnlPercent: number;
	date: Date;
}

function buildTradeGroups(trades: Trade[]): TradeGroup[] {
	// Bucket by orderId when present; each standalone trade gets its own key.
	// Multi-leg = 2+ DIFFERENT symbols under the same orderId (options strategy legs).
	const buckets = new Map<string, Trade[]>();
	for (const trade of trades) {
		const key = trade.orderId ? `o-${trade.orderId}` : `t-${trade.id}`;
		if (!buckets.has(key)) buckets.set(key, []);
		buckets.get(key)!.push(trade);
	}

	return Array.from(buckets.entries()).map(([key, group]) => {
		const isMultiLeg = new Set(group.map((t) => t.symbol)).size > 1;
		const totalPnl = group.reduce((s, t) => s + t.pnl, 0);
		const totalBuyValue = group.reduce((s, t) => s + t.buyValue, 0);
		const totalPnlPercent = totalBuyValue !== 0 ? (totalPnl / totalBuyValue) * 100 : 0;
		return {
			key,
			label: isMultiLeg
				? `${group[0].underlyingTicker} — ${group.length} Legs`
				: group[0].underlyingTicker,
			trades: group,
			isMultiLeg,
			totalPnl: isMultiLeg ? totalPnl : group[0].pnl,
			totalPnlPercent: isMultiLeg ? totalPnlPercent : group[0].pnlPercent,
			date: group[0].date,
		};
	});
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PnlCell({ value, isPercent }: { value: number; isPercent?: boolean }) {
	const isPos = value >= 0;
	const sign = isPos ? "+" : "-";
	const abs = Math.abs(value);
	const formatted = isPercent
		? `${sign}${abs.toFixed(2)}%`
		: `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	return (
		<span className={cn("font-semibold", isPos ? "text-emerald-400" : "text-red-400")}>
			{formatted}
		</span>
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TradesTable({ trades, onSort, sortConfig }: TradesTableProps) {
	const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

	const toggleKey = (key: string) => {
		setExpandedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const tradeGroups = buildTradeGroups(trades);

	const SortIcon = ({ column }: { column: string }) => {
		if (sortConfig?.key !== column) return <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />;
		return sortConfig.direction === "asc" ? (
			<ArrowUp className="w-3.5 h-3.5" />
		) : (
			<ArrowDown className="w-3.5 h-3.5" />
		);
	};

	const SortableHead = ({
		column,
		label,
		className,
	}: {
		column: string;
		label: string;
		className?: string;
	}) => (
		<TableHead
			className={`cursor-pointer select-none hover:text-zinc-200 transition-colors ${className ?? ""}`}
			onClick={() => onSort(column)}
		>
			<div className="flex items-center gap-1.5">
				{label}
				<SortIcon column={column} />
			</div>
		</TableHead>
	);

	return (
		<Card>
			<CardContent className="p-0">
				<div className="overflow-x-auto">
					<Table className="min-w-[700px]">
						<TableHeader>
							<TableRow className="border-zinc-800 hover:bg-transparent">
								<TableHead className="w-8 pl-4" />
								<SortableHead column="date" label="Date" className="pl-2" />
								<SortableHead column="underlyingTicker" label="Strategy / Ticker" />
								<SortableHead column="quantity" label="Qty" />
								<SortableHead
									column="buyPrice"
									label="Buy Price"
									className="hidden md:table-cell"
								/>
								<SortableHead
									column="sellPrice"
									label="Sell Price"
									className="hidden md:table-cell"
								/>
								<SortableHead
									column="buyValue"
									label="Buy Value"
									className="hidden lg:table-cell"
								/>
								<SortableHead
									column="sellValue"
									label="Sell Value"
									className="hidden lg:table-cell"
								/>
								<SortableHead column="pnl" label="P&L" />
								<SortableHead column="pnlPercent" label="P&L %" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{tradeGroups.length === 0 ? (
								<TableRow>
									<TableCell colSpan={10} className="py-10 text-center text-zinc-500">
										No trades found
									</TableCell>
								</TableRow>
							) : (
								tradeGroups.map((group) => {
									const isExpanded = expandedKeys.has(group.key);

									// ── Multi-leg group row ──────────────────────────────
									if (group.isMultiLeg) {
										return (
											<React.Fragment key={group.key}>
												<TableRow
													className="border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-800/40 cursor-pointer select-none"
													onClick={() => toggleKey(group.key)}
												>
													<TableCell className="pl-4 text-zinc-500">
														{isExpanded ? (
															<ChevronDown className="w-4 h-4" />
														) : (
															<ChevronRight className="w-4 h-4" />
														)}
													</TableCell>
													<TableCell className="pl-2 text-zinc-300 text-xs whitespace-nowrap">
														{group.date.toLocaleDateString()}
													</TableCell>
													<TableCell>
														<span className="font-bold text-zinc-50 text-sm">
															{group.label}
														</span>
													</TableCell>
													<TableCell className="text-zinc-500 text-xs">—</TableCell>
													<TableCell className="hidden md:table-cell text-zinc-500 text-xs">
														—
													</TableCell>
													<TableCell className="hidden md:table-cell text-zinc-500 text-xs">
														—
													</TableCell>
													<TableCell className="hidden lg:table-cell text-zinc-500 text-xs">
														—
													</TableCell>
													<TableCell className="hidden lg:table-cell text-zinc-500 text-xs">
														—
													</TableCell>
													<TableCell>
														<PnlCell value={group.totalPnl} />
													</TableCell>
													<TableCell>
														<PnlCell value={group.totalPnlPercent} isPercent />
													</TableCell>
												</TableRow>

												<TableRow className="border-0 hover:bg-transparent p-0">
													<TableCell colSpan={10} className="p-0 border-0">
														<div
															className="grid transition-[grid-template-rows] duration-300 ease-in-out"
															style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
														>
															<div className="overflow-hidden">
																<table className="w-full min-w-[700px] text-sm">
																	<tbody>
																		{group.trades.map((trade) => (
																			<tr
																				key={trade.id}
																				className="border-b border-zinc-800/30 hover:bg-zinc-900/50"
																			>
																				<td className="pl-4 py-3 w-8" />
																				<td className="pl-8 py-3 text-zinc-300 text-xs whitespace-nowrap">
																					<div className="md:hidden">
																						{trade.date.toLocaleDateString()}
																					</div>
																					<div className="hidden md:block">
																						{trade.date.toLocaleDateString()}{" "}
																						<span className="text-zinc-500">
																							{trade.date.toLocaleTimeString()}
																						</span>
																					</div>
																				</td>
																				<td className="py-3 px-4 font-mono text-zinc-400 text-xs">
																					{trade.symbol}
																				</td>
																				<td className="py-3 px-4 text-zinc-300">
																					{trade.quantity.toLocaleString()}
																				</td>
																				<td className="py-3 px-4 hidden md:table-cell text-zinc-300">
																					${trade.buyPrice.toFixed(2)}
																				</td>
																				<td className="py-3 px-4 hidden md:table-cell text-zinc-300">
																					${trade.sellPrice.toFixed(2)}
																				</td>
																				<td className="py-3 px-4 hidden lg:table-cell text-zinc-300">
																					$
																					{trade.buyValue.toLocaleString(undefined, {
																						minimumFractionDigits: 2,
																						maximumFractionDigits: 2,
																					})}
																				</td>
																				<td className="py-3 px-4 hidden lg:table-cell text-zinc-300">
																					$
																					{trade.sellValue.toLocaleString(undefined, {
																						minimumFractionDigits: 2,
																						maximumFractionDigits: 2,
																					})}
																				</td>
																				<td className="py-3 px-4">
																					<PnlCell value={trade.pnl} />
																				</td>
																				<td className="py-3 px-4">
																					<PnlCell value={trade.pnlPercent} isPercent />
																				</td>
																			</tr>
																		))}
																	</tbody>
																</table>
															</div>
														</div>
													</TableCell>
												</TableRow>
											</React.Fragment>
										);
									}

									// ── Flat row (single trade / no group) ──────────────
									const trade = group.trades[0];
									return (
										<TableRow key={group.key} className="border-zinc-800/60">
											<TableCell className="pl-4" />
											<TableCell className="pl-2 text-zinc-300 text-xs whitespace-nowrap">
												<div className="md:hidden">{trade.date.toLocaleDateString()}</div>
												<div className="hidden md:block">
													{trade.date.toLocaleDateString()}{" "}
													<span className="text-zinc-500">
														{trade.date.toLocaleTimeString()}
													</span>
												</div>
											</TableCell>
											<TableCell className="font-semibold text-zinc-50">
												{group.label}
											</TableCell>
											<TableCell className="text-zinc-300">
												{trade.quantity.toLocaleString()}
											</TableCell>
											<TableCell className="hidden md:table-cell text-zinc-300">
												${trade.buyPrice.toFixed(2)}
											</TableCell>
											<TableCell className="hidden md:table-cell text-zinc-300">
												${trade.sellPrice.toFixed(2)}
											</TableCell>
											<TableCell className="hidden lg:table-cell text-zinc-300">
												$
												{trade.buyValue.toLocaleString(undefined, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</TableCell>
											<TableCell className="hidden lg:table-cell text-zinc-300">
												$
												{trade.sellValue.toLocaleString(undefined, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</TableCell>
											<TableCell>
												<PnlCell value={trade.pnl} />
											</TableCell>
											<TableCell>
												<PnlCell value={trade.pnlPercent} isPercent />
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
