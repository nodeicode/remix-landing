import React, { useState, useCallback, useEffect } from "react";
import { RefreshCw, Loader2, Terminal, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";

interface LogLine {
	ts: number;
	msg: string;
	stream: string;
	env: "prod" | "staging";
}

interface Meta {
	count: number;
	truncated: boolean;
	fetchMs: number;
}

type Env = "prod" | "staging";
type Preset = "1d" | "1w" | "1m" | "3m";

const PRESETS: { key: Preset; label: string; days: number }[] = [
	{ key: "1d", label: "1d", days: 1 },
	{ key: "1w", label: "1w", days: 7 },
	{ key: "1m", label: "1m", days: 30 },
	{ key: "3m", label: "3m", days: 90 },
];

function getLevel(msg: string): string {
	const m = /- (DEBUG|INFO|WARNING|ERROR|CRITICAL) -/.exec(msg);
	return m ? m[1] : "INFO";
}

function levelStyles(level: string) {
	switch (level) {
		case "ERROR":
		case "CRITICAL":
			return {
				accent: "bg-red-500",
				badge: "text-red-400",
				row: "bg-red-950/10",
				msg: "text-red-300",
			};
		case "WARNING":
			return {
				accent: "bg-yellow-500",
				badge: "text-yellow-400",
				row: "bg-yellow-950/[0.06]",
				msg: "text-yellow-200",
			};
		case "DEBUG":
			return { accent: "bg-zinc-700", badge: "text-zinc-600", row: "", msg: "text-zinc-500" };
		default: // INFO
			return { accent: "bg-zinc-600", badge: "text-zinc-400", row: "", msg: "text-zinc-300" };
	}
}

function formatTs(ts: number): string {
	return new Date(ts).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatDateGroup(ts: number): string {
	return new Date(ts).toLocaleDateString([], {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function LogViewer() {
	const [env, setEnv] = useState<Env>("prod");
	const [preset, setPreset] = useState<Preset | null>("1w");
	const [range, setRange] = useState<DateRange | undefined>();
	const [calOpen, setCalOpen] = useState(false);
	const [textFilter, setTextFilter] = useState("");
	const [lines, setLines] = useState<LogLine[]>([]);
	const [meta, setMeta] = useState<Meta | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		const now = Date.now();
		let startMs: number;
		let endMs = now;

		if (preset) {
			const days = PRESETS.find((p) => p.key === preset)!.days;
			startMs = now - days * 86_400_000;
		} else if (range?.from) {
			startMs = range.from.getTime();
			endMs = range.to
				? new Date(range.to).setHours(23, 59, 59, 999)
				: new Date(range.from).setHours(23, 59, 59, 999);
		} else {
			startMs = now - 7 * 86_400_000;
		}

		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/signals?env=${env}&startMs=${startMs}&endMs=${endMs}`);
			if (!res.ok) {
				const j = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(j.error ?? `HTTP ${res.status}`);
			}
			const data = (await res.json()) as { lines?: LogLine[]; meta?: Meta };
			setLines(data.lines ?? []);
			setMeta(data.meta ?? null);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load logs");
		} finally {
			setIsLoading(false);
		}
	}, [env, preset, range]);

	useEffect(() => {
		load();
	}, [load]);

	// Client-side: text filter only (market hours already filtered server-side)
	const visible = textFilter.trim()
		? lines.filter((l) => l.msg.toLowerCase().includes(textFilter.toLowerCase()))
		: lines;

	const rangeLabel = range?.from
		? range.to
			? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d")}`
			: format(range.from, "MMM d")
		: "Pick range";

	return (
		<div className="flex flex-col gap-3">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-2">
				{/* Env: prod / staging only */}
				<div className="flex items-center gap-0.5 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
					{(["prod", "staging"] as Env[]).map((e) => (
						<button
							key={e}
							onClick={() => setEnv(e)}
							className={cn(
								"px-3 py-1.5 text-xs rounded-md font-medium transition-all",
								env === e
									? e === "prod"
										? "bg-blue-600 text-white"
										: "bg-amber-500 text-white"
									: "text-zinc-500 hover:text-zinc-300",
							)}
						>
							{e}
						</button>
					))}
				</div>

				{/* Preset buttons */}
				<div className="flex gap-1">
					{PRESETS.map(({ key, label }) => (
						<button
							key={key}
							onClick={() => {
								setPreset(key);
								setRange(undefined);
							}}
							className={cn(
								"px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors",
								preset === key
									? "bg-blue-600 text-white"
									: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
							)}
						>
							{label}
						</button>
					))}
				</div>

				{/* Custom date range picker */}
				<Popover open={calOpen} onOpenChange={setCalOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className={cn(
								"h-8 text-xs gap-1.5",
								!preset && "ring-1 ring-blue-500 border-blue-500",
							)}
						>
							<CalendarIcon className="w-3 h-3" />
							{preset ? "Custom" : rangeLabel}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="start">
						<Calendar
							mode="range"
							selected={range}
							onSelect={(r) => {
								setRange(r);
								setPreset(null);
								if (r?.from && r?.to) setCalOpen(false);
							}}
							toDate={new Date()}
							numberOfMonths={2}
						/>
					</PopoverContent>
				</Popover>

				{/* Text filter */}
				<input
					type="text"
					value={textFilter}
					onChange={(e) => setTextFilter(e.target.value)}
					placeholder="Filter…"
					className="h-8 px-3 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
				/>

				{/* Reload */}
				<Button
					variant="outline"
					size="sm"
					onClick={load}
					disabled={isLoading}
					className="h-8 px-3"
				>
					{isLoading ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<RefreshCw className="w-3.5 h-3.5" />
					)}
				</Button>

				{/* Stats */}
				{meta && !isLoading && (
					<span className="text-[10px] text-zinc-600 ml-auto tabular-nums">
						{visible.length.toLocaleString()} lines · {meta.fetchMs}ms
						{meta.truncated && " · truncated"}
					</span>
				)}
			</div>

			{/* Error */}
			{error && (
				<div className="rounded-md border border-red-900/50 bg-red-950/20 px-4 py-3 text-xs text-red-400">
					{error}
				</div>
			)}

			{/* Log terminal */}
			<div className="rounded-xl border border-zinc-800 bg-zinc-950 font-mono text-xs min-h-96 lg:min-h-[60vh] max-h-[65vh] lg:max-h-[80vh] flex flex-col overflow-hidden">
				{/* Column header */}
				<div className="flex items-center shrink-0 border-b border-zinc-800 bg-zinc-900/80 select-none">
					<div className="w-0.75 shrink-0" />
					<span className="px-3 py-2 w-22.5 text-[10px] text-zinc-600 uppercase tracking-widest">
						Time
					</span>
					<span className="px-3 py-2 w-20 text-[10px] text-zinc-600 uppercase tracking-widest border-l border-zinc-800/60">
						Level
					</span>
					<span className="px-3 py-2 text-[10px] text-zinc-600 uppercase tracking-widest border-l border-zinc-800/60">
						Message
					</span>
				</div>

				{/* Scrollable rows */}
				<div className="overflow-y-auto flex-1">
					{isLoading && lines.length === 0 ? (
						<div className="flex items-center justify-center h-40 text-zinc-600 gap-2">
							<Loader2 className="w-4 h-4 animate-spin" />
							Loading…
						</div>
					) : visible.length === 0 ? (
						<div className="flex items-center justify-center h-40 text-zinc-600 gap-2">
							<Terminal className="w-4 h-4" />
							No logs found
						</div>
					) : (
						visible.map((line, i) => {
							const level = getLevel(line.msg);
							const styles = levelStyles(level);
							const prevDate = i > 0 ? new Date(visible[i - 1].ts).toDateString() : null;
							const currDate = new Date(line.ts).toDateString();
							const showDateSep = prevDate !== currDate;
							return (
								<React.Fragment key={i}>
									{showDateSep && (
										<div className="flex items-center gap-3 px-4 py-1.5 bg-zinc-900/60 border-b border-zinc-800/50 select-none">
											<div className="h-px flex-1 bg-zinc-800" />
											<span className="text-[10px] text-zinc-500 uppercase tracking-widest">
												{formatDateGroup(line.ts)}
											</span>
											<div className="h-px flex-1 bg-zinc-800" />
										</div>
									)}
									<div
										className={cn(
											"group flex items-stretch border-b border-zinc-800/30 last:border-0 hover:bg-white/2.5 transition-colors",
											styles.row,
										)}
									>
										{/* Level accent bar */}
										<div className={cn("w-0.75 shrink-0", styles.accent)} />

										{/* Timestamp */}
										<span className="shrink-0 flex items-center px-3 w-22.5 text-[11px] text-zinc-500 tabular-nums select-none whitespace-nowrap border-r border-zinc-800/40">
											{formatTs(line.ts)}
										</span>

										{/* Level */}
										<span
											className={cn(
												"shrink-0 flex items-center px-3 w-20 text-[10px] font-semibold uppercase tracking-wider border-r border-zinc-800/40",
												styles.badge,
											)}
										>
											{level}
										</span>

										{/* Message */}
										<span
											className={cn(
												"flex-1 py-2 px-3 break-all whitespace-pre-wrap leading-5 min-w-0 text-[11px]",
												styles.msg,
											)}
										>
											{line.msg}
										</span>
									</div>
								</React.Fragment>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}

export { LogViewer as SignalsTimeline };
