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

export function ActivePositions({ positions, getUnderlyingTicker }: ActivePositionsProps) {
	if (positions.length === 0) {
		return (
			<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
				<p className="text-gray-500 dark:text-gray-400">No active positions</p>
			</div>
		);
	}

	return (
		<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
			<div className="overflow-x-auto">
				<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
					<thead className="bg-gray-50 dark:bg-gray-900">
						<tr>
							<th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Ticker
							</th>
							<th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Qty
							</th>
							<th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Avg Price
							</th>
							<th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Current Price
							</th>
							<th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Market Value
							</th>
							<th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Cost Basis
							</th>
							<th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Unrealized P&L
							</th>
							<th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								P&L %
							</th>
						</tr>
					</thead>
					<tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
						{positions.map((position) => {
							const unrealizedPl = parseFloat(position.unrealized_pl);
							const unrealizedPlpc = parseFloat(position.unrealized_plpc);

							return (
								<tr
									key={position.asset_id}
									className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
								>
									<td className="px-3 md:px-6 py-4 whitespace-nowrap">
										<div className="text-sm font-semibold text-gray-900 dark:text-white">
											{getUnderlyingTicker(position.symbol)}
										</div>
										<div className="text-xs text-gray-500 dark:text-gray-400">
											{position.symbol}
										</div>
									</td>
									<td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
										{parseFloat(position.qty).toLocaleString()}
									</td>
									<td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
										${parseFloat(position.avg_entry_price).toFixed(2)}
									</td>
									<td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
										${parseFloat(position.current_price).toFixed(2)}
									</td>
									<td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
										$
										{parseFloat(position.market_value).toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</td>
									<td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
										$
										{parseFloat(position.cost_basis).toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</td>
									<td
										className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-semibold ${
											unrealizedPl >= 0 ? "text-green-600" : "text-red-600"
										}`}
									>
										{unrealizedPl >= 0 ? "+" : ""}$
										{unrealizedPl.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}
									</td>
									<td
										className={`px-3 md:px-6 py-4 whitespace-nowrap text-sm font-semibold ${
											unrealizedPlpc >= 0 ? "text-green-600" : "text-red-600"
										}`}
									>
										{unrealizedPlpc >= 0 ? "+" : ""}
										{(unrealizedPlpc * 100).toFixed(2)}%
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
