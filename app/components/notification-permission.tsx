import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

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
				<div className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg">
					<span className="text-zinc-500 text-xs">Loading...</span>
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
				<div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/10 border border-emerald-400/20 rounded-lg">
					<Bell className="w-3 h-3 text-emerald-400" />
					<span className="text-emerald-400 text-xs font-medium">Notifications On</span>
				</div>
			) : permission === "denied" ? (
				<div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-400/10 border border-red-400/20 rounded-lg">
					<BellOff className="w-3 h-3 text-red-400" />
					<span className="text-red-400 text-xs font-medium">Blocked</span>
				</div>
			) : (
				<button
					onClick={requestPermission}
					disabled={isRequesting}
					className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
				>
					{isRequesting ? (
						<>
							<Loader2 className="w-3 h-3 animate-spin" />
							<span>Requesting...</span>
						</>
					) : (
						<>
							<Bell className="w-3 h-3" />
							<span>Enable Notifications</span>
						</>
					)}
				</button>
			)}
		</div>
	);
}
