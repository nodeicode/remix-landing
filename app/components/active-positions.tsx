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

// ─── OCC option parsing ───────────────────────────────────────────────────────

interface ParsedOption {
	underlying: string;
	expiry: string; // "YYMMDD"
	optType: "C" | "P";
	strike: number; // dollars
}

function parseOptionSymbol(symbol: string): ParsedOption | null {
	const m = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
	if (!m) return null;
	const [, underlying, expiry, optType, strikeStr] = m;
	return {
		underlying,
		expiry,
		optType: optType as "C" | "P",
		strike: parseInt(strikeStr, 10) / 1000,
	};
}

const MONTHS = [
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
] as const;

function formatExpiry(expiry: string): string {
	const mm = parseInt(expiry.slice(2, 4), 10);
	const dd = parseInt(expiry.slice(4, 6), 10);
	const yy = expiry.slice(0, 2);
	return `${MONTHS[mm - 1]} ${dd} '${yy}`;
}

// Parse full OCC symbol to a short human-readable label (used in leg rows)
function parseOptionLabel(symbol: string): string {
	const parsed = parseOptionSymbol(symbol);
	if (!parsed) return symbol;
	const strike = parsed.strike % 1 === 0 ? parsed.strike.toFixed(0) : parsed.strike.toFixed(2);
	const type = parsed.optType === "C" ? "Call" : "Put";
	return `${formatExpiry(parsed.expiry)} $${strike} ${type}`;
}

// ─── Strategy detection ───────────────────────────────────────────────────────

type StrategyName =
	| "Short Iron Condor"
	| "Long Iron Condor"
	| "Call Debit Spread"
	| "Call Credit Spread"
	| "Put Debit Spread"
	| "Put Credit Spread"
	| "Long Strangle"
	| "Short Strangle"
	| "Long Straddle"
	| "Short Straddle";

interface ParsedLeg {
	position: Position;
	optType: "C" | "P";
	strike: number;
	side: "long" | "short";
	qty: number; // always positive
}

interface StrategyResult {
	name: StrategyName;
	multiplier: number; // contract count per leg (the "×N" figure)
	legs: Position[]; // sorted: puts asc strike then calls asc strike
}

function detectStrategy(parsedLegs: ParsedLeg[]): StrategyResult | null {
	const puts = parsedLegs.filter((l) => l.optType === "P").sort((a, b) => a.strike - b.strike);
	const calls = parsedLegs
		.filter((l) => l.optType === "C")
		.sort((a, b) => a.strike - b.strike);

	const longPuts = puts.filter((l) => l.side === "long");
	const shortPuts = puts.filter((l) => l.side === "short");
	const longCalls = calls.filter((l) => l.side === "long");
	const shortCalls = calls.filter((l) => l.side === "short");

	const qtys = parsedLegs.map((l) => l.qty);
	const multiplier = qtys.every((q) => q === qtys[0]) ? qtys[0] : 1;

	// Legs sorted for display: puts asc then calls asc
	const sortedLegs = [...puts.map((l) => l.position), ...calls.map((l) => l.position)];

	// ── Iron Condor (4 legs: 1 LP + 1 SP + 1 SC + 1 LC) ──────────────────────
	if (
		longPuts.length === 1 &&
		shortPuts.length === 1 &&
		longCalls.length === 1 &&
		shortCalls.length === 1
	) {
		const lp = longPuts[0],
			sp = shortPuts[0];
		const lc = longCalls[0],
			sc = shortCalls[0];

		// Short Iron Condor: sell the body → LP < SP ··gap·· SC < LC (collect premium)
		if (lp.strike < sp.strike && sp.strike < sc.strike && sc.strike < lc.strike) {
			return { name: "Short Iron Condor", multiplier, legs: sortedLegs };
		}
		// Long Iron Condor: buy the body → SP < LP ··gap·· LC < SC (pay debit)
		if (sp.strike < lp.strike && lp.strike < lc.strike && lc.strike < sc.strike) {
			return { name: "Long Iron Condor", multiplier, legs: sortedLegs };
		}
		return null; // Iron butterfly or other exotic form — show as raw legs
	}

	// ── Call Spread (2 calls: 1 long + 1 short) ───────────────────────────────
	if (
		calls.length === 2 &&
		puts.length === 0 &&
		longCalls.length === 1 &&
		shortCalls.length === 1
	) {
		const name: StrategyName =
			longCalls[0].strike < shortCalls[0].strike ? "Call Debit Spread" : "Call Credit Spread";
		return { name, multiplier, legs: calls.map((l) => l.position) };
	}

	// ── Put Spread (2 puts: 1 long + 1 short) ─────────────────────────────────
	if (
		puts.length === 2 &&
		calls.length === 0 &&
		longPuts.length === 1 &&
		shortPuts.length === 1
	) {
		// Put Debit Spread: long HIGHER put, short lower put (pays debit, profits on decline)
		const name: StrategyName =
			longPuts[0].strike > shortPuts[0].strike ? "Put Debit Spread" : "Put Credit Spread";
		return { name, multiplier, legs: puts.map((l) => l.position) };
	}

	// ── Strangle / Straddle (1 call + 1 put) ──────────────────────────────────
	if (calls.length === 1 && puts.length === 1) {
		const allLong = longCalls.length === 1 && longPuts.length === 1;
		const allShort = shortCalls.length === 1 && shortPuts.length === 1;
		const sameStrike = calls[0].strike === puts[0].strike;

		if (allLong)
			return {
				name: sameStrike ? "Long Straddle" : "Long Strangle",
				multiplier,
				legs: sortedLegs,
			};
		if (allShort)
			return {
				name: sameStrike ? "Short Straddle" : "Short Strangle",
				multiplier,
				legs: sortedLegs,
			};
	}

	return null; // unrecognized
}

// ─── PositionGroup ────────────────────────────────────────────────────────────

interface PositionGroup {
	key: string;
	underlying: string;
	strategyLabel: string; // e.g. "AAPL — Short Iron Condor" or just "AAPL"
	strategyBadge?: string; // e.g. "×2", "4 legs"
	strategyName?: StrategyName | "Stock" | "Option";
	expiry?: string; // formatted: "Jan 17 '25"
	multiplier: number;
	legs: Position[];
	isExpandable: boolean; // false = single flat row
	totalPl: number;
	totalMv: number;
	totalCost: number;
	totalPlPct: number;
}

function buildPositionGroups(
	positions: Position[],
	getUnderlyingTicker: (s: string) => string,
): PositionGroup[] {
	const groups: PositionGroup[] = [];

	// ── Separate stocks from options ──
	const stockPositions = positions.filter((p) => !parseOptionSymbol(p.symbol));
	const optionPositions = positions.filter((p) => parseOptionSymbol(p.symbol));

	// Stock positions → always flat rows
	for (const pos of stockPositions) {
		const pl = parseFloat(pos.unrealized_pl);
		const mv = parseFloat(pos.market_value);
		const cost = parseFloat(pos.cost_basis);
		groups.push({
			key: `stock-${pos.asset_id}`,
			underlying: pos.symbol,
			strategyLabel: pos.symbol,
			strategyName: "Stock",
			multiplier: parseFloat(pos.qty),
			legs: [pos],
			isExpandable: false,
			totalPl: pl,
			totalMv: mv,
			totalCost: cost,
			totalPlPct: cost !== 0 ? (pl / Math.abs(cost)) * 100 : 0,
		});
	}

	// ── Group options by (underlying, expiry) then detect strategy ──
	const byUnderlyingExpiry = new Map<string, { parsed: ParsedOption; position: Position }[]>();
	for (const pos of optionPositions) {
		const parsed = parseOptionSymbol(pos.symbol)!;
		const key = `${parsed.underlying}|${parsed.expiry}`;
		if (!byUnderlyingExpiry.has(key)) byUnderlyingExpiry.set(key, []);
		byUnderlyingExpiry.get(key)!.push({ parsed, position: pos });
	}

	for (const [key, items] of byUnderlyingExpiry.entries()) {
		const [underlying, expiry] = key.split("|");

		const parsedLegs: ParsedLeg[] = items.map(({ parsed, position }) => ({
			position,
			optType: parsed.optType,
			strike: parsed.strike,
			side: position.side as "long" | "short",
			qty: parseFloat(position.qty),
		}));

		const strategy = detectStrategy(parsedLegs);
		const allLegs = strategy?.legs ?? items.map((i) => i.position);
		const totalPl = allLegs.reduce((s, p) => s + parseFloat(p.unrealized_pl), 0);
		const totalMv = allLegs.reduce((s, p) => s + parseFloat(p.market_value), 0);
		const totalCost = allLegs.reduce((s, p) => s + parseFloat(p.cost_basis), 0);
		const totalPlPct = totalCost !== 0 ? (totalPl / Math.abs(totalCost)) * 100 : 0;
		const expiryFormatted = formatExpiry(expiry);

		if (strategy) {
			groups.push({
				key,
				underlying,
				strategyLabel: `${underlying} — ${strategy.name}`,
				strategyBadge: strategy.multiplier > 1 ? `×${strategy.multiplier}` : undefined,
				strategyName: strategy.name,
				expiry: expiryFormatted,
				multiplier: strategy.multiplier,
				legs: strategy.legs,
				isExpandable: true,
				totalPl,
				totalMv,
				totalCost,
				totalPlPct,
			});
		} else if (allLegs.length === 1) {
			// Single option → flat row, no expand
			groups.push({
				key,
				underlying,
				strategyLabel: parseOptionLabel(allLegs[0].symbol),
				strategyName: "Option",
				expiry: expiryFormatted,
				multiplier: parsedLegs[0]?.qty ?? 1,
				legs: allLegs,
				isExpandable: false,
				totalPl,
				totalMv,
				totalCost,
				totalPlPct,
			});
		} else {
			// Unrecognized multi-leg (e.g. iron butterfly, ratio spread)
			groups.push({
				key,
				underlying,
				strategyLabel: `${underlying}`,
				strategyBadge: `${allLegs.length} legs`,
				expiry: expiryFormatted,
				multiplier: 1,
				legs: allLegs,
				isExpandable: true,
				totalPl,
				totalMv,
				totalCost,
				totalPlPct,
			});
		}
	}

	return groups;
}

// ─── P&L display helpers ──────────────────────────────────────────────────────

function PlTag({ value }: { value: number }) {
	const isPos = value > 0;
	const isZero = value === 0;
	if (isZero) return <span className="text-zinc-500 font-semibold text-sm">$0.00</span>;
	return (
		<span className={cn("font-semibold text-sm", isPos ? "text-emerald-400" : "text-red-400")}>
			{isPos ? "+" : "-"}$
			{Math.abs(value).toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})}
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivePositions({ positions, getUnderlyingTicker }: ActivePositionsProps) {
	const positionGroups = useMemo(
		() => buildPositionGroups(positions, getUnderlyingTicker),
		[positions, getUnderlyingTicker],
	);

	const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

	const toggleKey = (key: string) => {
		setExpandedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
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
					<table className="w-full min-w-[560px] text-sm">
						<thead>
							<tr className="border-b border-zinc-800">
								<th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 w-8" />
								<th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">
									Strategy / Leg
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
							{positionGroups.map((group) => {
								const isExpanded = expandedKeys.has(group.key);

								// ── Flat (non-expandable) row ────────────────────────────
								if (!group.isExpandable) {
									const pos = group.legs[0];
									const unrealizedPl = group.totalPl;
									const unrealizedPlpc = group.totalPlPct;
									const isOption = !!parseOptionSymbol(pos.symbol);

									return (
										<tr
											key={group.key}
											className="border-b border-zinc-800/60 hover:bg-zinc-900/50 transition-colors"
										>
											<td className="px-4 py-3" />
											<td className="px-4 py-3">
												<div className="flex flex-col gap-0.5">
													{isOption ? (
														<>
															<span className="text-zinc-200 text-sm font-semibold">
																{group.strategyLabel}
															</span>
															{group.expiry && (
																<span className="text-zinc-500 text-[10px] font-mono">
																	{group.expiry}
																</span>
															)}
														</>
													) : (
														<span className="text-zinc-200 text-sm font-bold">
															{group.strategyLabel}
														</span>
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

								// ── Expandable group row ─────────────────────────────────
								return (
									<React.Fragment key={group.key}>
										{/* Group header */}
										<tr
											onClick={() => toggleKey(group.key)}
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
												<div className="flex items-center gap-2 flex-wrap">
													<span className="font-bold text-zinc-50 text-sm">
														{group.strategyLabel}
													</span>
													{group.strategyBadge && (
														<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-semibold tabular-nums">
															{group.strategyBadge}
														</span>
													)}
													{group.expiry && (
														<span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 font-mono">
															{group.expiry}
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
													{group.totalMv.toLocaleString(undefined, {
														minimumFractionDigits: 2,
														maximumFractionDigits: 2,
													})}
												</span>
											</td>
											<td className="px-4 py-3 text-right">
												<PlTag value={group.totalPl} />
											</td>
											<td className="px-4 py-3 text-right pr-6">
												<div className="flex justify-end">
													<PlPctTag value={group.totalPlPct} />
												</div>
											</td>
										</tr>

										{/* Expanded legs */}
										<tr className="border-0">
											<td colSpan={8} className="p-0 border-0">
												<div
													className="grid transition-[grid-template-rows] duration-300 ease-in-out"
													style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
												>
													<div className="overflow-hidden">
														<table className="w-full min-w-[560px] text-sm">
															<tbody>
																{group.legs.map((position) => {
																	const parsedOpt = parseOptionSymbol(position.symbol);
																	const unrealizedPl = parseFloat(position.unrealized_pl);
																	const unrealizedPlpc =
																		parseFloat(position.unrealized_plpc) * 100;
																	const sideLabel =
																		position.side === "long" ? "Long" : "Short";
																	const strikeLabel = parsedOpt
																		? `$${parsedOpt.strike % 1 === 0 ? parsedOpt.strike.toFixed(0) : parsedOpt.strike.toFixed(2)} ${parsedOpt.optType === "C" ? "Call" : "Put"}`
																		: null;

																	return (
																		<tr
																			key={position.asset_id}
																			className="border-b border-zinc-800/30 hover:bg-zinc-900/50 transition-colors"
																		>
																			<td className="px-4 py-2.5" />
																			<td className="px-4 py-2.5 pl-8">
																				<div className="flex flex-col gap-0.5">
																					{parsedOpt ? (
																						<>
																							<div className="flex items-center gap-1.5">
																								<span
																									className={cn(
																										"text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide",
																										position.side === "long"
																											? "bg-emerald-400/10 text-emerald-400"
																											: "bg-red-400/10 text-red-400",
																									)}
																								>
																									{sideLabel}
																								</span>
																								{strikeLabel && (
																									<span className="text-zinc-300 text-xs font-semibold">
																										{strikeLabel}
																									</span>
																								)}
																							</div>
																							<span className="text-zinc-600 text-[10px] font-mono">
																								{position.symbol}
																							</span>
																						</>
																					) : (
																						<span className="text-zinc-200 text-sm font-semibold">
																							{position.symbol}
																						</span>
																					)}
																				</div>
																			</td>
																			<td className="px-4 py-2.5 text-right text-zinc-300 text-xs tabular-nums">
																				{parseFloat(position.qty).toLocaleString()}
																			</td>
																			<td className="px-4 py-2.5 text-right text-zinc-300 text-xs tabular-nums hidden sm:table-cell">
																				${parseFloat(position.avg_entry_price).toFixed(2)}
																			</td>
																			<td className="px-4 py-2.5 text-right text-zinc-300 text-xs tabular-nums hidden sm:table-cell">
																				${parseFloat(position.current_price).toFixed(2)}
																			</td>
																			<td className="px-4 py-2.5 text-right text-zinc-300 text-xs tabular-nums hidden md:table-cell">
																				$
																				{parseFloat(position.market_value).toLocaleString(
																					undefined,
																					{
																						minimumFractionDigits: 2,
																						maximumFractionDigits: 2,
																					},
																				)}
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
															</tbody>
														</table>
													</div>
												</div>
											</td>
										</tr>
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
