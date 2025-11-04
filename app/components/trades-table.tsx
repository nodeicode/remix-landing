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

export function TradesTable({ trades, onSort, sortConfig, metrics }: TradesTableProps) {
	const getSortIcon = (key: string) => {
		if (sortConfig?.key !== key) {
			return (
				<svg
					className="w-4 h-4 opacity-30"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
					/>
				</svg>
			);
		}
		return sortConfig.direction === "asc" ? (
			<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
			</svg>
		) : (
			<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M19 9l-7 7-7-7"
				/>
			</svg>
		);
	};

	return (
		<div>
			<div className="overflow-x-auto -mx-3 md:mx-0">
				<table className="w-full min-w-full">
					<thead className="bg-gray-50 dark:bg-gray-700">
						<tr>
							<th
								onClick={() => onSort("date")}
								className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									Date
									{getSortIcon("date")}
								</div>
							</th>
							<th
								onClick={() => onSort("underlyingTicker")}
								className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									Ticker
									{getSortIcon("underlyingTicker")}
								</div>
							</th>
							<th
								onClick={() => onSort("quantity")}
								className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									Qty
									{getSortIcon("quantity")}
								</div>
							</th>
							<th
								onClick={() => onSort("buyPrice")}
								className="hidden md:table-cell px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									Buy Price
									{getSortIcon("buyPrice")}
								</div>
							</th>
							<th
								onClick={() => onSort("sellPrice")}
								className="hidden md:table-cell px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									Sell Price
									{getSortIcon("sellPrice")}
								</div>
							</th>
							<th
								onClick={() => onSort("buyValue")}
								className="hidden lg:table-cell px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									Buy Value
									{getSortIcon("buyValue")}
								</div>
							</th>
							<th
								onClick={() => onSort("sellValue")}
								className="hidden lg:table-cell px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									Sell Value
									{getSortIcon("sellValue")}
								</div>
							</th>
							<th
								onClick={() => onSort("pnl")}
								className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									P&L
									{getSortIcon("pnl")}
								</div>
							</th>
							<th
								onClick={() => onSort("pnlPercent")}
								className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
							>
								<div className="flex items-center gap-1 md:gap-2">
									P&L %{getSortIcon("pnlPercent")}
								</div>
							</th>
						</tr>
					</thead>
					<tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
						{trades.length === 0 ? (
							<tr>
								<td
									colSpan={9}
									className="px-3 md:px-6 py-8 text-center text-xs md:text-sm text-gray-500 dark:text-gray-400"
								>
									No trades found
								</td>
							</tr>
						) : (
							trades.map((trade) => (
								<tr
									key={trade.id}
									className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
								>
									<td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-900 dark:text-white">
										<div className="md:hidden">{trade.date.toLocaleDateString()}</div>
										<div className="hidden md:block">
											{trade.date.toLocaleDateString()} {trade.date.toLocaleTimeString()}
										</div>
									</td>
									<td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm font-semibold text-gray-900 dark:text-white">
										{trade.underlyingTicker}
									</td>
									<td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-900 dark:text-white">
										{trade.quantity.toLocaleString()}
									</td>
									<td className="hidden md:table-cell px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-900 dark:text-white">
										${trade.buyPrice.toFixed(2)}
									</td>
									<td className="hidden md:table-cell px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-900 dark:text-white">
										${trade.sellPrice.toFixed(2)}
									</td>
									<td className="hidden lg:table-cell px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-900 dark:text-white">
										$
										{trade.buyValue.toLocaleString(undefined, {
											minimumFractionDigits: 1,
											maximumFractionDigits: 4,
										})}
									</td>
									<td className="hidden lg:table-cell px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-900 dark:text-white">
										$
										{trade.sellValue.toLocaleString(undefined, {
											minimumFractionDigits: 1,
											maximumFractionDigits: 4,
										})}
									</td>
									<td
										className={`px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm font-semibold ${
											trade.pnl >= 0 ? "text-green-600" : "text-red-600"
										}`}
									>
										{trade.pnl >= 0 ? "+" : ""}$
										{trade.pnl.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</td>
									<td
										className={`px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm font-semibold ${
											trade.pnlPercent >= 0 ? "text-green-600" : "text-red-600"
										}`}
									>
										{trade.pnlPercent >= 0 ? "+" : ""}
										{trade.pnlPercent.toFixed(2)}%
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
