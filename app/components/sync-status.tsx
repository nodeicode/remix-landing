import { useEffect, useState } from "react";

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
		if (!isOnline) return "text-red-600 dark:text-red-400";
		if (isSyncing) return "text-yellow-600 dark:text-yellow-400";
		return "text-green-600 dark:text-green-400";
	};

	const getStatusIcon = () => {
		if (!isOnline) return "⚠️";
		if (isSyncing) return "🔄";
		return "✅";
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
					<span className="text-sm text-gray-400">⏳</span>
					<span className="text-xs md:text-sm font-medium text-gray-400 dark:text-gray-500">
						Connecting...
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className={`flex items-center gap-2 ${className}`}>
			<div className="flex items-center gap-1.5">
				<span className={`text-sm ${getStatusColor()}`}>{getStatusIcon()}</span>
				<span className={`text-xs md:text-sm font-medium ${getStatusColor()}`}>
					{getStatusText()}
				</span>
			</div>
			{!isSyncing && lastSyncTime && (
				<span className="text-xs text-gray-500 dark:text-gray-400">
					• Last sync: {formatLastSync()}
				</span>
			)}
			{!isOnline && (
				<span className="text-xs text-gray-500 dark:text-gray-400">• Data may be stale</span>
			)}
		</div>
	);
}
