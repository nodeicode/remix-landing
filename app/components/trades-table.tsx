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
	side: "buy" | "sell" | "expired";
	price: number;
	cashFlow: number;
	orderId?: string;
	source?: string;
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

interface TradeGroup {
	key: string;
	label: string;
	trades: Trade[];
	isMultiLeg: boolean;
	totalCashFlow: number;
	date: Date;
}

function buildTradeGroups(trades: Trade[]): TradeGroup[] {
	const buckets = new Map<string, Trade[]>();
	for (const trade of trades) {
		const key = trade.orderId ? `o-${trade.orderId}` : `t-${trade.id}`;
		if (!buckets.has(key)) buckets.set(key, []);
		buckets.get(key)!.push(trade);
	}
	return Array.from(buckets.entries()).map(([key, group]) => {
		const isMultiLeg = new Set(group.map((t) => t.symbol)).size > 1;
		const totalCashFlow = group.reduce((s, t) => s + t.cashFlow, 0);
		return {
			key,
			label: isMultiLeg
				? `${group[0].underlyingTicker} \u2014 ${group.length} Legs`
				: group[0].underlyingTicker,
			trades: group,
			isMultiLeg,
			totalCashFlow,
			date: group[0].date,
		};
	});
}

function CashFlowCell({ value }: { value: number }) {
	if (value === 0) {
		return <span className="font-semibold tabular-nums text-zinc-500">$0.00</span>;
	}
	const isPos = value > 0;
	const sign = isPos ? "+" : "-";
	const abs = Math.abs(value);
	return (
		<span
			className={cn("font-semibold tabular-nums", isPos ? "text-emerald-400" : "text-red-400")}
		>
			{sign}$
			{abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
		</span>
	);
}

function SideBadge({ side }: { side: Trade["side"] }) {
	return (
		<span
			className={cn(
				"text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded",
				side === "sell" && "text-emerald-400 bg-emerald-400/10",
				side === "buy" && "text-red-400 bg-red-400/10",
				side === "expired" && "text-zinc-500 bg-zinc-500/10",
			)}
		>
			{side === "expired" ? "EXP" : side}
		</span>
	);
}

function SourceBadge({ source, side }: { source?: string; side?: Trade["side"] }) {
	if (side === "expired") {
		return (
			<span className="inline text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded w-fit bg-zinc-700/60 text-zinc-400">
				AUTO-EXP
			</span>
		);
	}
	const s = source || "dashboard";
	if (s === "alpaca::auto_liquidate") {
		return (
			<span className="inline text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded w-fit bg-amber-400/10 text-amber-400">
				AUTO-LIQ
			</span>
		);
	}
	if (s === "access_key") {
		return (
			<span className="inline text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded w-fit bg-blue-400/10 text-blue-400">
				API
			</span>
		);
	}
	if (s === "dashboard") {
		return (
			<span className="inline text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded w-fit bg-zinc-700/60 text-zinc-400">
				MANUAL
			</span>
		);
	}
	return (
		<span className="inline text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded w-fit bg-zinc-700/60 text-zinc-500">
			{s}
		</span>
	);
}

function shortDate(d: Date) {
	const now = new Date();
	if (d.getFullYear() !== now.getFullYear()) {
		return d.toLocaleDateString(undefined, {
			month: "numeric",
			day: "numeric",
			year: "2-digit",
		});
	}
	return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function shortTime(d: Date) {
	return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

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
		if (sortConfig?.key !== column) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
		return sortConfig.direction === "asc" ? (
			<ArrowUp className="w-3 h-3" />
		) : (
			<ArrowDown className="w-3 h-3" />
		);
	};

	const SortableHead = ({
		column,
		label,
		className,
		rightAlign,
	}: {
		column: string;
		label: string;
		className?: string;
		rightAlign?: boolean;
	}) => (
		<TableHead
			className={cn(
				"cursor-pointer select-none hover:text-zinc-200 transition-colors text-xs px-3 h-10",
				rightAlign && "text-right",
				className,
			)}
			onClick={() => onSort(column)}
		>
			<div className={cn("flex items-center gap-1", rightAlign && "justify-end")}>
				{label}
				<SortIcon column={column} />
			</div>
		</TableHead>
	);

	return (
		<Card>
			<CardContent className="p-0">
				<Table>
					<TableHeader>
						<TableRow className="border-zinc-800 hover:bg-transparent">
							<TableHead className="w-8 pl-3 pr-0" />
							<SortableHead column="date" label="Date" className="whitespace-nowrap" />
							<SortableHead column="underlyingTicker" label="Ticker" />
							<SortableHead
								column="quantity"
								label="Qty"
								className="hidden sm:table-cell"
								rightAlign
							/>
							<TableHead className="hidden sm:table-cell text-zinc-400 font-medium text-xs px-3 h-10">
								Side
							</TableHead>
							<TableHead className="hidden sm:table-cell text-zinc-400 font-medium text-xs px-3 h-10 text-right">
								Price
							</TableHead>
							<SortableHead column="cashFlow" label="Amount" className="pr-4" rightAlign />
						</TableRow>
					</TableHeader>
					<TableBody>
						{tradeGroups.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="py-10 text-center text-zinc-500">
									No fills found
								</TableCell>
							</TableRow>
						) : (
							tradeGroups.map((group) => {
								const isExpanded = expandedKeys.has(group.key);

								if (group.isMultiLeg) {
									return (
										<React.Fragment key={group.key}>
											<TableRow
												className="border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-800/40 cursor-pointer select-none"
												onClick={() => toggleKey(group.key)}
											>
												<TableCell className="pl-3 pr-0 text-zinc-500">
													{isExpanded ? (
														<ChevronDown className="w-3.5 h-3.5" />
													) : (
														<ChevronRight className="w-3.5 h-3.5" />
													)}
												</TableCell>
												<TableCell className="pl-1 text-zinc-400 text-xs whitespace-nowrap px-2">
													<div className="flex flex-col">
														<span>{shortDate(group.date)}</span>
														<span className="text-zinc-600 text-[10px] tabular-nums">
															{shortTime(group.date)}
														</span>
													</div>
												</TableCell>
												<TableCell className="text-xs px-2">
													<div className="flex flex-col gap-0.5">
														<span className="font-bold text-zinc-50">{group.label}</span>
														<SourceBadge
															source={group.trades[0].source}
															side={group.trades[0].side}
														/>
													</div>
												</TableCell>
												<TableCell className="hidden sm:table-cell text-zinc-500 text-xs text-right px-2">
													&mdash;
												</TableCell>
												<TableCell className="hidden sm:table-cell text-zinc-500 text-xs px-2">
													&mdash;
												</TableCell>
												<TableCell className="hidden sm:table-cell text-zinc-500 text-xs px-2">
													&mdash;
												</TableCell>
												<TableCell className="text-right pr-3 px-2">
													<CashFlowCell value={group.totalCashFlow} />
												</TableCell>
											</TableRow>
											<TableRow className="border-0 hover:bg-transparent p-0">
												<TableCell colSpan={7} className="p-0 border-0">
													<div
														className="grid transition-[grid-template-rows] duration-300 ease-in-out"
														style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
													>
														<div className="overflow-hidden">
															<table className="w-full text-xs">
																<tbody>
																	{group.trades.map((trade) => (
																		<tr
																			key={trade.id}
																			className="border-b border-zinc-800/30 hover:bg-zinc-900/50"
																		>
																			<td className="pl-3 py-2 w-6" />
																			<td className="pl-1 py-2 text-zinc-500 whitespace-nowrap px-2">
																				<div className="flex flex-col">
																					<span>{shortDate(trade.date)}</span>
																					<span className="text-zinc-600 text-[10px] tabular-nums">
																						{shortTime(trade.date)}
																					</span>
																				</div>
																			</td>
																			<td className="py-2 px-2 font-mono text-zinc-400">
																				{trade.symbol}
																			</td>
																			<td className="hidden sm:table-cell py-2 px-2 text-zinc-400 text-right tabular-nums">
																				{trade.quantity.toLocaleString()}
																			</td>
																			<td className="hidden sm:table-cell py-2 px-2">
																				<SideBadge side={trade.side} />
																			</td>
																			<td className="hidden sm:table-cell py-2 px-2 text-zinc-400 font-mono text-right tabular-nums">
																				${trade.price.toFixed(2)}
																			</td>
																			<td className="py-2 px-2 pr-3 text-right">
																				<CashFlowCell value={trade.cashFlow} />
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

								const trade = group.trades[0];
								return (
									<TableRow key={group.key} className="border-zinc-800/60">
										<TableCell className="pl-3 pr-0" />
										<TableCell className="pl-1 text-zinc-400 text-xs whitespace-nowrap px-2">
											<div className="flex flex-col">
												<span>{shortDate(trade.date)}</span>
												<span className="text-zinc-600 text-[10px] tabular-nums">
													{shortTime(trade.date)}
												</span>
											</div>
										</TableCell>
										<TableCell className="font-semibold text-zinc-50 text-xs px-2">
											<div className="flex flex-col gap-0.5">
												<span>{group.label}</span>
												<SourceBadge source={trade.source} side={trade.side} />
											</div>
										</TableCell>
										<TableCell className="hidden sm:table-cell text-zinc-400 text-xs text-right px-2 tabular-nums">
											{trade.quantity.toLocaleString()}
										</TableCell>
										<TableCell className="hidden sm:table-cell px-2">
											<SideBadge side={trade.side} />
										</TableCell>
										<TableCell className="hidden sm:table-cell text-zinc-400 text-xs font-mono text-right px-2 tabular-nums">
											${trade.price.toFixed(2)}
										</TableCell>
										<TableCell className="text-right pr-3 px-2">
											<CashFlowCell value={trade.cashFlow} />
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
