import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Card, CardContent } from "./ui/card";

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

export function TradesTable({ trades, onSort, sortConfig }: TradesTableProps) {
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
					<Table>
						<TableHeader>
							<TableRow className="border-zinc-800 hover:bg-transparent">
								<SortableHead column="date" label="Date" className="pl-6" />
								<SortableHead column="underlyingTicker" label="Ticker" />
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
							{trades.length === 0 ? (
								<TableRow>
									<TableCell colSpan={9} className="py-10 text-center text-zinc-500">
										No trades found
									</TableCell>
								</TableRow>
							) : (
								trades.map((trade) => (
									<TableRow key={trade.id}>
										<TableCell className="pl-6 text-zinc-300 text-xs whitespace-nowrap">
											<div className="md:hidden">{trade.date.toLocaleDateString()}</div>
											<div className="hidden md:block">
												{trade.date.toLocaleDateString()}{" "}
												<span className="text-zinc-500">
													{trade.date.toLocaleTimeString()}
												</span>
											</div>
										</TableCell>
										<TableCell className="font-semibold text-zinc-50">
											{trade.underlyingTicker}
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
											<span
												className={
													trade.pnl >= 0
														? "text-emerald-400 font-semibold"
														: "text-red-400 font-semibold"
												}
											>
												{trade.pnl >= 0 ? "+" : ""}$
												{trade.pnl.toLocaleString(undefined, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</span>
										</TableCell>
										<TableCell>
											<span
												className={
													trade.pnlPercent >= 0
														? "text-emerald-400 font-semibold"
														: "text-red-400 font-semibold"
												}
											>
												{trade.pnlPercent >= 0 ? "+" : ""}
												{trade.pnlPercent.toFixed(2)}%
											</span>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
