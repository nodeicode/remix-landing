import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";

interface SyncStatusProps {
	className?: string;
}

export function SyncStatus({ className = "" }: SyncStatusProps) {
	const [isHydrated, setIsHydrated] = useState(false);
	const [isOnline, setIsOnline] = useState(true);
	const [isSyncing, setIsSyncing] = useState(false);
	const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

	useEffect(() => {
		// Mark as hydrated and check browser online status
		setIsHydrated(true);
		setIsOnline(navigator.onLine);

		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		// Listen for service worker sync messages
		if ("serviceWorker" in navigator) {
			const handleMessage = (event: MessageEvent) => {
				console.log("[SyncStatus] Received message:", event.data);
				if (event.data.type === "SYNC_STARTED") {
					setIsSyncing(true);
				} else if (event.data.type === "SYNC_COMPLETED") {
					setIsSyncing(false);
					setLastSyncTime(new Date(event.data.timestamp));
					console.log("[SyncStatus] Last sync time set to:", new Date(event.data.timestamp));
				} else if (event.data.type === "SYNC_FAILED") {
					setIsSyncing(false);
				}
			};

			navigator.serviceWorker.addEventListener("message", handleMessage);

			// Trigger an initial sync check when component mounts
			if (navigator.serviceWorker.controller) {
				console.log("[SyncStatus] Requesting initial position check...");
				navigator.serviceWorker.controller.postMessage({ type: "CHECK_NOW" });
			}

			return () => {
				window.removeEventListener("online", handleOnline);
				window.removeEventListener("offline", handleOffline);
				navigator.serviceWorker.removeEventListener("message", handleMessage);
			};
		}

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	const getStatusColor = () => {
		if (!isOnline) return "text-red-400";
		if (isSyncing) return "text-yellow-400";
		return "text-emerald-400";
	};

	const getStatusIcon = () => {
		if (!isOnline) return <WifiOff className="w-3 h-3" />;
		if (isSyncing) return <RefreshCw className="w-3 h-3 animate-spin" />;
		return <CheckCircle2 className="w-3 h-3" />;
	};

	const getStatusText = () => {
		if (!isOnline) return "Offline";
		if (isSyncing) return "Syncing...";
		return "Online";
	};

	const formatLastSync = () => {
		if (!lastSyncTime) return "Never";

		const now = new Date();
		const diff = now.getTime() - lastSyncTime.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (seconds < 60) return "Just now";
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;

		return lastSyncTime.toLocaleString();
	};

	// Don't render anything until hydrated to prevent hydration mismatch
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
				<span className={getStatusColor()}>{getStatusIcon()}</span>
				<span className={`text-xs font-medium ${getStatusColor()}`}>{getStatusText()}</span>
			</div>
			{!isSyncing && lastSyncTime && (
				<span className="text-xs text-zinc-500">• Last sync: {formatLastSync()}</span>
			)}
			{!isOnline && <span className="text-xs text-zinc-500">• Data may be stale</span>}
		</div>
	);
}
