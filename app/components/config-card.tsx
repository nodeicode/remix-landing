import { useState, useEffect, useCallback } from "react";
import {
	RefreshCw,
	Loader2,
	AlertCircle,
	Settings2,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

interface EnvConfigResponse {
	config: StrategiesConfig | null;
	raw: string | null;
	error: string | null;
}

interface ConfigResponse {
	prod: EnvConfigResponse;
	staging: EnvConfigResponse;
}

interface StrategiesConfig {
	strategies?: Strategy[];
}

interface Strategy {
	name: string;
	clients?: string[];
	config?: Record<string, unknown>;
}

// ── Strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({ strategy, env }: { strategy: Strategy; env: "prod" | "staging" }) {
	const configEntries = strategy.config ? Object.entries(strategy.config) : [];
	const hasConfig = configEntries.length > 0;
	const [expanded, setExpanded] = useState(true);

	const headerContent = (
		<div className="flex items-center gap-2 min-w-0">
			<code className="text-xs font-mono font-semibold text-zinc-100 truncate">
				{strategy.name}
			</code>
			{strategy.clients?.map((c) => (
				<Badge
					key={c}
					variant={c === "prod" ? "live" : "paper"}
					className="text-[9px] px-1.5 h-4 shrink-0"
				>
					{c}
				</Badge>
			))}
		</div>
	);

	return (
		<div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
			{/* Strategy header — only interactive when there are config params */}
			{hasConfig ? (
				<button
					onClick={() => setExpanded((v) => !v)}
					className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-800/40 transition-colors"
				>
					{headerContent}
					{expanded ? (
						<ChevronUp className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
					) : (
						<ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
					)}
				</button>
			) : (
				<div className="flex items-center px-3 py-2.5">{headerContent}</div>
			)}

			{/* Config params */}
			{hasConfig && expanded && (
				<div className="border-t border-zinc-800/70 px-3 py-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
					{configEntries.map(([key, value]) => (
						<>
							<span
								key={`k-${key}`}
								className="text-[11px] font-mono text-zinc-500 self-start pt-px"
							>
								{key}
							</span>
							<ConfigValue key={`v-${key}`} value={value} />
						</>
					))}
				</div>
			)}
		</div>
	);
}

function ConfigValue({ value }: { value: unknown }) {
	if (Array.isArray(value)) {
		return (
			<div className="flex flex-wrap gap-1">
				{value.map((v, i) => (
					<span
						key={i}
						className="inline-block px-1.5 py-0.5 rounded bg-zinc-800 text-[11px] font-mono text-emerald-300"
					>
						{String(v)}
					</span>
				))}
			</div>
		);
	}
	if (typeof value === "number") {
		return <span className="text-[11px] font-mono text-violet-400">{value}</span>;
	}
	if (typeof value === "boolean") {
		return <span className="text-[11px] font-mono text-amber-400">{String(value)}</span>;
	}
	if (value === null || value === undefined) {
		return <span className="text-[11px] font-mono text-red-400">null</span>;
	}
	if (typeof value === "object") {
		return (
			<pre className="text-[10px] font-mono text-zinc-300 whitespace-pre-wrap">
				{JSON.stringify(value, null, 2)}
			</pre>
		);
	}
	return <span className="text-[11px] font-mono text-zinc-200">{String(value)}</span>;
}

// ── Per-environment panel ─────────────────────────────────────────────────────
function EnvPanel({
	label,
	data,
	isLoading,
}: {
	label: "prod" | "staging";
	data: EnvConfigResponse | null;
	isLoading: boolean;
}) {
	const isProd = label === "prod";
	const strategies = data?.config?.strategies ?? [];

	return (
		<div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/70 shrink-0">
				<div className="flex items-center gap-2">
					<Badge variant={isProd ? "live" : "paper"} className="text-[9px] px-1.5 h-4">
						{label}
					</Badge>
					<span className="text-[10px] font-mono text-zinc-600">
						/trading/{label}/strategies_config
					</span>
				</div>
				{!isLoading && !data?.error && (
					<span className="text-[10px] text-zinc-600 tabular-nums">
						{strategies.length} {strategies.length === 1 ? "strategy" : "strategies"}
					</span>
				)}
			</div>

			{/* Body */}
			<div className="px-3 py-3 overflow-y-auto max-h-112 space-y-2">
				{isLoading ? (
					<div className="flex items-center gap-2 py-8 text-zinc-600 justify-center">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						<span className="text-xs">Loading…</span>
					</div>
				) : data?.error ? (
					<div className="space-y-2">
						<div className="flex items-start gap-2 text-xs text-red-400">
							<AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
							<span className="break-all">{data.error}</span>
						</div>
						{/* Show raw value if JSON failed to parse */}
						{data.raw != null && (
							<div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
								<p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-widest">
									Raw SSM value
								</p>
								<pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all select-text">
									{data.raw}
								</pre>
							</div>
						)}
					</div>
				) : strategies.length > 0 ? (
					strategies.map((s) => <StrategyCard key={s.name} strategy={s} env={label} />)
				) : (
					<p className="py-6 text-center text-xs text-zinc-600">No strategies configured</p>
				)}
			</div>
		</div>
	);
}

// ── Public component ──────────────────────────────────────────────────────────
export function ConfigCard() {
	const [data, setData] = useState<ConfigResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastFetched, setLastFetched] = useState<Date | null>(null);

	const load = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/config");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			setData(await res.json());
			setLastFetched(new Date());
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load config");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Settings2 className="w-4 h-4 text-zinc-500" />
						<CardTitle className="text-sm font-semibold text-zinc-300">
							Strategies Config
						</CardTitle>
						<span className="text-[10px] text-zinc-600">SSM · read-only</span>
					</div>
					<div className="flex items-center gap-3">
						{lastFetched && !isLoading && (
							<span className="text-[10px] text-zinc-600 tabular-nums">
								{lastFetched.toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
									second: "2-digit",
								})}
							</span>
						)}
						<Button
							variant="ghost"
							size="sm"
							onClick={load}
							disabled={isLoading}
							className="h-7 px-2 text-zinc-400 hover:text-zinc-100"
						>
							{isLoading ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
							) : (
								<RefreshCw className="w-3.5 h-3.5" />
							)}
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0 space-y-3">
				{error && (
					<div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-400">
						<AlertCircle className="w-3.5 h-3.5 shrink-0" />
						{error}
					</div>
				)}
				<div className={cn("grid gap-3", "grid-cols-1 lg:grid-cols-2")}>
					<EnvPanel label="prod" data={data?.prod ?? null} isLoading={isLoading} />
					<EnvPanel label="staging" data={data?.staging ?? null} isLoading={isLoading} />
				</div>
			</CardContent>
		</Card>
	);
}
