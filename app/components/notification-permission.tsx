import { useState, useEffect } from "react";

export function NotificationPermission() {
	const [permission, setPermission] = useState<NotificationPermission>("default");
	const [isRequesting, setIsRequesting] = useState(false);
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		// Only run on client side
		setIsClient(true);

		if ("Notification" in window) {
			setPermission(Notification.permission);
		}
	}, []);

	const requestPermission = async () => {
		if (!("Notification" in window)) {
			alert("This browser does not support notifications");
			return;
		}

		setIsRequesting(true);
		try {
			const result = await Notification.requestPermission();
			setPermission(result);

			if (result === "granted") {
				console.log("[Notifications] ✅ Permission granted");
			} else {
				console.log("[Notifications] ❌ Permission denied");
			}
		} catch (error) {
			console.error("[Notifications] Error requesting permission:", error);
		} finally {
			setIsRequesting(false);
		}
	};

	// Render placeholder during SSR to avoid hydration mismatch
	if (!isClient) {
		return (
			<div className="flex items-center gap-2">
				<div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
					<span className="text-gray-400 dark:text-gray-500 text-sm">🔔 Loading...</span>
				</div>
			</div>
		);
	}

	if (typeof window === "undefined" || !("Notification" in window)) {
		return null;
	}
	return (
		<div className="flex items-center gap-2">
			{permission === "granted" ? (
				<div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
					<span className="text-green-600 dark:text-green-400 text-sm font-medium">
						🔔 Notifications Enabled
					</span>
				</div>
			) : permission === "denied" ? (
				<div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
					<span className="text-red-600 dark:text-red-400 text-sm font-medium">
						🔕 Notifications Blocked
					</span>
					<span className="text-xs text-red-500 dark:text-red-400">
						Enable in browser settings
					</span>
				</div>
			) : (
				<button
					onClick={requestPermission}
					disabled={isRequesting}
					className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
				>
					{isRequesting ? (
						<>
							<span className="animate-spin">⏳</span>
							<span>Requesting...</span>
						</>
					) : (
						<>
							<span>🔔</span>
							<span>Enable Notifications</span>
						</>
					)}
				</button>
			)}
		</div>
	);
}
