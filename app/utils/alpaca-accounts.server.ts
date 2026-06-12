import { parseNumberedAccounts } from "./env.server";

export interface AccountConfig {
	id: string;
	name: string;
	type: "LIVE" | "PAPER";
	apiKey: string;
	secretKey: string;
	baseUrl: string;
}

/** Resolve all configured Alpaca accounts (deduped by API key). */
export function getConfiguredAccounts(): AccountConfig[] {
	const accounts: AccountConfig[] = [];
	const seenApiKeys = new Set<string>();

	const addAccount = (account: AccountConfig) => {
		if (!account.apiKey || !account.secretKey) return;
		const normalizedKey = account.apiKey.trim();
		if (seenApiKeys.has(normalizedKey)) return;
		seenApiKeys.add(normalizedKey);
		accounts.push(account);
	};

	if (process.env.ALPACA_LIVE_API_KEY && process.env.ALPACA_LIVE_SECRET_KEY) {
		addAccount({
			id: "live",
			name: "Live Account",
			type: "LIVE",
			apiKey: process.env.ALPACA_LIVE_API_KEY,
			secretKey: process.env.ALPACA_LIVE_SECRET_KEY,
			baseUrl: "https://api.alpaca.markets",
		});
	}

	if (process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) {
		addAccount({
			id: "paper-default",
			name: "Paper Testing",
			type: "PAPER",
			apiKey: process.env.ALPACA_API_KEY,
			secretKey: process.env.ALPACA_SECRET_KEY,
			baseUrl: "https://paper-api.alpaca.markets",
		});
	}

	parseNumberedAccounts().forEach((acc, index) => {
		addAccount({
			id: `additional-${index}`,
			name: acc.name,
			type: acc.type,
			apiKey: acc.apiKey,
			secretKey: acc.secretKey,
			baseUrl:
				acc.type === "LIVE"
					? "https://api.alpaca.markets"
					: "https://paper-api.alpaca.markets",
		});
	});

	return accounts;
}

export function findAccountById(accountId: string): AccountConfig | null {
	return getConfiguredAccounts().find((a) => a.id === accountId) ?? null;
}
