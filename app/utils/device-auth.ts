export const DEVICE_AUTH_TOKEN = "trading-dashboard-device-passkey";
export const DEVICE_AUTH_STORAGE_KEY = "trading-dashboard-device-auth";

export function isDeviceUnlocked(): boolean {
	if (typeof window === "undefined") return false;
	return window.localStorage.getItem(DEVICE_AUTH_STORAGE_KEY) === DEVICE_AUTH_TOKEN;
}

export function unlockDevice(token: string): boolean {
	if (typeof window === "undefined") return false;
	if (token !== DEVICE_AUTH_TOKEN) return false;
	window.localStorage.setItem(DEVICE_AUTH_STORAGE_KEY, DEVICE_AUTH_TOKEN);
	return true;
}

export function lockDevice(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(DEVICE_AUTH_STORAGE_KEY);
}