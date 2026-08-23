const GITHUB_REPOSITORY = "nodeicode/remix-landing";
const CACHE_MS = 15 * 60_000;

export type GitHubActivity = {
	commitsLast7Days: number;
	commitsLast28Days: number;
	weeklyCommits: number[];
};

let cached: { value: GitHubActivity; expiresAt: number } | null = null;

async function fetchCommitCount(startMs: number, endMs: number, signal: AbortSignal): Promise<number | null> {
	const token = process.env.GITHUB_ACTIVITY_TOKEN;
	const params = new URLSearchParams({
		since: new Date(startMs).toISOString(),
		until: new Date(endMs).toISOString(),
		per_page: "100",
	});
	const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/commits?${params}`, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "lohitaryan-engineering-card",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		signal,
	});
	if (!response.ok) return null;
	const commits = await response.json() as unknown;
	return Array.isArray(commits) ? commits.length : null;
}

/** Counts recent commits in the public portfolio repository, not popularity or event-feed activity. */
export async function fetchGitHubActivity(now = Date.now()): Promise<GitHubActivity | null> {
	if (cached && cached.expiresAt > now) return cached.value;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 4_000);
	try {
		const weekMs = 7 * 86_400_000;
		const counts = await Promise.all(Array.from({ length: 4 }, (_, index) => {
			const startMs = now - (4 - index) * weekMs;
			return fetchCommitCount(startMs, startMs + weekMs, controller.signal);
		}));
		if (counts.some((count) => count == null)) return null;
		const weeklyCommits = counts as number[];

		const value = {
			commitsLast7Days: weeklyCommits[3],
			commitsLast28Days: weeklyCommits.reduce((total, count) => total + count, 0),
			weeklyCommits,
		};
		cached = { value, expiresAt: now + CACHE_MS };
		return value;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
