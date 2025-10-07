import { useMemo, useState } from "react";

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

export function PortfolioChart({ data, timeframe }: PortfolioChartProps) {
	const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
	if (!data || !data.timestamp || data.timestamp.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
				No data available for this timeframe
			</div>
		);
	}

	// Calculate metrics
	const metrics = useMemo(() => {
		const currentValue = data.equity[data.equity.length - 1];
		const startValue = data.equity[0];
		const totalChange = currentValue - startValue;
		const totalChangePct = ((currentValue - startValue) / startValue) * 100;
		const highValue = Math.max(...data.equity);
		const lowValue = Math.min(...data.equity);

		return {
			currentValue,
			totalChange,
			totalChangePct,
			highValue,
			lowValue,
		};
	}, [data]);

	// Prepare chart data points with smooth curve calculation
	const chartPoints = useMemo(() => {
		const maxEquity = Math.max(...data.equity);
		const minEquity = Math.min(...data.equity);
		const range = maxEquity - minEquity || 1; // Prevent division by zero
		const padding = range * 0.15; // More padding for better view

		return data.equity.map((value, index) => {
			const x = (index / (data.equity.length - 1)) * 100;
			const y = ((maxEquity + padding - value) / (range + padding * 2)) * 100;
			const timestamp = data.timestamp[index];
			const profitLoss = data.profit_loss[index];
			const profitLossPct = data.profit_loss_pct[index];
			return { x, y, value, timestamp, profitLoss, profitLossPct };
		});
	}, [data]);

	// Create smooth SVG path using bezier curves
	const smoothPathD = useMemo(() => {
		if (chartPoints.length === 0) return "";
		if (chartPoints.length === 1) return `M ${chartPoints[0].x},${chartPoints[0].y}`;

		let path = `M ${chartPoints[0].x},${chartPoints[0].y}`;

		for (let i = 0; i < chartPoints.length - 1; i++) {
			const current = chartPoints[i];
			const next = chartPoints[i + 1];

			// Calculate control points for smooth bezier curve
			const controlPointX = (current.x + next.x) / 2;

			path += ` C ${controlPointX},${current.y} ${controlPointX},${next.y} ${next.x},${next.y}`;
		}

		return path;
	}, [chartPoints]);

	// Create area path with smooth curve
	const areaPathD = useMemo(() => {
		if (chartPoints.length === 0) return "";

		let path = `M 0,100 L ${chartPoints[0].x},${chartPoints[0].y}`;

		for (let i = 0; i < chartPoints.length - 1; i++) {
			const current = chartPoints[i];
			const next = chartPoints[i + 1];
			const controlPointX = (current.x + next.x) / 2;
			path += ` C ${controlPointX},${current.y} ${controlPointX},${next.y} ${next.x},${next.y}`;
		}

		path += ` L 100,100 Z`;
		return path;
	}, [chartPoints]);

	// Format date based on timeframe
	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		if (timeframe === "1D") {
			return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		} else if (timeframe === "1W") {
			return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
		} else {
			return date.toLocaleDateString([], { month: "short", day: "numeric" });
		}
	};

	const isPositive = metrics.totalChange >= 0;

	// Get Y-axis labels (5 evenly spaced values)
	const yAxisLabels = useMemo(() => {
		const max = metrics.highValue;
		const min = metrics.lowValue;
		const step = (max - min) / 4;
		return [max, max - step, max - step * 2, max - step * 3, min];
	}, [metrics]);

	return (
		<div>
			{/* Metrics Display */}
			<div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
				<div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-4 border border-blue-200 dark:border-blue-700">
					<div className="text-sm text-blue-600 dark:text-blue-400 mb-1 font-medium">
						Current Value
					</div>
					<div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
						$
						{metrics.currentValue.toLocaleString(undefined, {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						})}
					</div>
				</div>
				<div
					className={`bg-gradient-to-br rounded-xl p-4 border ${
						isPositive
							? "from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-800/20 border-green-200 dark:border-green-700"
							: "from-red-50 to-rose-100 dark:from-red-900/20 dark:to-rose-800/20 border-red-200 dark:border-red-700"
					}`}
				>
					<div
						className={`text-sm mb-1 font-medium ${
							isPositive
								? "text-green-600 dark:text-green-400"
								: "text-red-600 dark:text-red-400"
						}`}
					>
						Change
					</div>
					<div
						className={`text-2xl font-bold ${
							isPositive
								? "text-green-900 dark:text-green-100"
								: "text-red-900 dark:text-red-100"
						}`}
					>
						{isPositive ? "+" : ""}$
						{metrics.totalChange.toLocaleString(undefined, {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						})}
					</div>
				</div>
				<div
					className={`bg-gradient-to-br rounded-xl p-4 border ${
						isPositive
							? "from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-800/20 border-green-200 dark:border-green-700"
							: "from-red-50 to-rose-100 dark:from-red-900/20 dark:to-rose-800/20 border-red-200 dark:border-red-700"
					}`}
				>
					<div
						className={`text-sm mb-1 font-medium ${
							isPositive
								? "text-green-600 dark:text-green-400"
								: "text-red-600 dark:text-red-400"
						}`}
					>
						Change %
					</div>
					<div
						className={`text-2xl font-bold ${
							isPositive
								? "text-green-900 dark:text-green-100"
								: "text-red-900 dark:text-red-100"
						}`}
					>
						{isPositive ? "+" : ""}
						{metrics.totalChangePct.toFixed(2)}%
					</div>
				</div>
				<div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-4 border border-purple-200 dark:border-purple-700">
					<div className="text-sm text-purple-600 dark:text-purple-400 mb-1 font-medium">
						High
					</div>
					<div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
						$
						{metrics.highValue.toLocaleString(undefined, {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						})}
					</div>
				</div>
				<div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl p-4 border border-orange-200 dark:border-orange-700">
					<div className="text-sm text-orange-600 dark:text-orange-400 mb-1 font-medium">
						Low
					</div>
					<div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
						$
						{metrics.lowValue.toLocaleString(undefined, {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						})}
					</div>
				</div>
			</div>

			{/* Chart */}
			<div className="relative bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
				<div className="flex items-start gap-6">
					{/* Y-axis labels */}
					<div className="flex flex-col justify-between h-80 py-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
						{yAxisLabels.map((label, i) => (
							<div key={i} className="text-right">
								${label.toLocaleString(undefined, { maximumFractionDigits: 0 })}
							</div>
						))}
					</div>

					{/* Chart area */}
					<div className="flex-1 relative">
						<svg
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							className="w-full h-80"
							onMouseLeave={() => setHoveredPoint(null)}
						>
							<defs>
								{/* Gradient for area fill */}
								<linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
									<stop
										offset="0%"
										stopColor={isPositive ? "#22c55e" : "#ef4444"}
										stopOpacity="0.3"
									/>
									<stop
										offset="100%"
										stopColor={isPositive ? "#22c55e" : "#ef4444"}
										stopOpacity="0.05"
									/>
								</linearGradient>

								{/* Gradient for line */}
								<linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
									<stop
										offset="0%"
										stopColor={isPositive ? "#22c55e" : "#ef4444"}
										stopOpacity="0.8"
									/>
									<stop
										offset="100%"
										stopColor={isPositive ? "#10b981" : "#dc2626"}
										stopOpacity="1"
									/>
								</linearGradient>
							</defs>

							{/* Horizontal grid lines */}
							{[0, 25, 50, 75, 100].map((y) => (
								<line
									key={y}
									x1="0"
									y1={y}
									x2="100"
									y2={y}
									stroke="currentColor"
									strokeWidth="0.1"
									className="text-gray-300 dark:text-gray-600"
									opacity="0.3"
									strokeDasharray="1,1"
								/>
							))}

							{/* Vertical grid lines */}
							{[0, 25, 50, 75, 100].map((x) => (
								<line
									key={`v-${x}`}
									x1={x}
									y1="0"
									x2={x}
									y2="100"
									stroke="currentColor"
									strokeWidth="0.1"
									className="text-gray-300 dark:text-gray-600"
									opacity="0.3"
									strokeDasharray="1,1"
								/>
							))}

							{/* Area fill with gradient */}
							<path d={areaPathD} fill="url(#areaGradient)" />

							{/* Main line with smooth curve and gradient */}
							<path
								d={smoothPathD}
								fill="none"
								stroke="url(#lineGradient)"
								strokeWidth="0.8"
								strokeLinecap="round"
								strokeLinejoin="round"
								vectorEffect="non-scaling-stroke"
								style={{
									filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
								}}
							/>

							{/* Interactive points */}
							{chartPoints.map((point, index) => (
								<g key={index}>
									{/* Invisible larger circle for easier hover */}
									<circle
										cx={point.x}
										cy={point.y}
										r="3"
										fill="transparent"
										onMouseEnter={() => setHoveredPoint(index)}
										className="cursor-pointer"
									/>
									{/* Visible point */}
									<circle
										cx={point.x}
										cy={point.y}
										r={hoveredPoint === index ? "1.2" : "0.6"}
										fill={isPositive ? "#22c55e" : "#ef4444"}
										className="transition-all duration-200"
										style={{
											filter:
												hoveredPoint === index
													? "drop-shadow(0 0 4px rgba(0,0,0,0.3))"
													: "none",
										}}
									/>
									{hoveredPoint === index && (
										<circle
											cx={point.x}
											cy={point.y}
											r="2"
											fill="none"
											stroke={isPositive ? "#22c55e" : "#ef4444"}
											strokeWidth="0.3"
											opacity="0.5"
											className="animate-ping"
										/>
									)}
								</g>
							))}
						</svg>

						{/* Tooltip */}
						{hoveredPoint !== null && (
							<div
								className="absolute bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-3 rounded-lg shadow-xl text-sm font-medium border-2 border-gray-700 dark:border-gray-300 pointer-events-none z-10"
								style={{
									left: `${chartPoints[hoveredPoint].x}%`,
									top: `${chartPoints[hoveredPoint].y}%`,
									transform: "translate(-50%, -120%)",
								}}
							>
								<div className="text-xs text-gray-300 dark:text-gray-600 mb-1">
									{formatDate(chartPoints[hoveredPoint].timestamp)}
								</div>
								<div className="font-bold text-base mb-1">
									$
									{chartPoints[hoveredPoint].value.toLocaleString(undefined, {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2,
									})}
								</div>
								<div
									className={`text-xs ${
										chartPoints[hoveredPoint].profitLoss >= 0
											? "text-green-400 dark:text-green-600"
											: "text-red-400 dark:text-red-600"
									}`}
								>
									{chartPoints[hoveredPoint].profitLoss >= 0 ? "+" : ""}$
									{chartPoints[hoveredPoint].profitLoss.toLocaleString(undefined, {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2,
									})}{" "}
									({chartPoints[hoveredPoint].profitLoss >= 0 ? "+" : ""}
									{chartPoints[hoveredPoint].profitLossPct.toFixed(2)}%)
								</div>
								{/* Arrow pointer */}
								<div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full">
									<div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900 dark:border-t-gray-100"></div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
