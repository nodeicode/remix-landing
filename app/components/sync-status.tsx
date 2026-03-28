import { useEffect, useState } from "react";
import { Wifi, WifiOff, CheckCircle2, Loader2 } from "lucide-react";

interface SyncStatusProps {
	className?: string;
}

export function SyncStatus({ className = "" }: SyncStatusProps) {
	const [isHydrated, setIsHydrated] = useState(false);
	const [isOnline, setIsOnline] = useState(true);

	useEffect(() => {
		setIsHydrated(true);
		setIsOnline(navigator.onLine);

		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	if (!isHydrated) {
		return (
			<div className={`flex items-center gap-2 ${className}`}>
				<div className="flex items-center gap-1.5">
					<Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
					<span className="text-xs font-medium text-zinc-500">Connecting...</span>
				</div>
			</div>
		);
	}

	return (
		<div className={`flex items-center gap-2 ${className}`}>
			<div className="flex items-center gap-1.5">
				{isOnline ? (
					<>
						<CheckCircle2 className="w-3 h-3 text-emerald-400" />
						<span className="text-xs font-medium text-emerald-400">Online</span>
					</>
				) : (
					<>
						<WifiOff className="w-3 h-3 text-red-400" />
						<span className="text-xs font-medium text-red-400">Offline</span>
						<span className="text-xs text-zinc-500">• Data may be stale</span>
					</>
				)}
			</div>
		</div>
	);
}
