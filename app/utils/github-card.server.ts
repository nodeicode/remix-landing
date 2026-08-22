import type { PublicMonitorSummary } from "~/utils/public-monitor";

const GITHUB_API = "https://api.github.com";
const DEFAULT_USERNAME = "nodeicode";

type GitHubRepo = {
	name: string;
	full_name: string;
	html_url: string;
	updated_at: string;
	stargazers_count: number;
	forks_count: number;
	archived: boolean;
};

export type GitHubCardData = {
	username: string;
	repositoryCount: number;
	stars: number;
	forks: number;
	latestRepository: { name: string; url: string; updatedAt: string } | null;
	generatedAt: number;
	monitor: Pick<PublicMonitorSummary, "asOfMs" | "windows"> | null;
};

function githubHeaders() {
	const token = process.env.GITHUB_TOKEN;
	return {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "lohit-aryan-engineering-card",
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	};
}

async function githubFetch<T>(path: string): Promise<T> {
	const response = await fetch(`${GITHUB_API}${path}`, {
		headers: githubHeaders(),
		signal: AbortSignal.timeout(8_000),
	});
	if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
	return response.json() as Promise<T>;
}

/** Fetches only public GitHub profile data. A token is optional but raises API limits. */
export async function fetchGitHubCardData(monitor: GitHubCardData["monitor"]): Promise<GitHubCardData> {
	const username = process.env.GITHUB_USERNAME?.trim() || DEFAULT_USERNAME;
	const repos = await githubFetch<GitHubRepo[]>(`/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`);
	const activeRepos = repos.filter((repo) => !repo.archived);
	const latest = activeRepos[0] ?? null;

	return {
		username,
		repositoryCount: activeRepos.length,
		stars: activeRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0),
		forks: activeRepos.reduce((sum, repo) => sum + repo.forks_count, 0),
		latestRepository: latest && { name: latest.name, url: latest.html_url, updatedAt: latest.updated_at },
		generatedAt: Date.now(),
		monitor,
	};
}

function escapeXml(value: string): string {
	return value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] ?? character);
}

function shortAge(iso: string | null, now: number): string {
	if (!iso) return "No recent public updates";
	const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
	if (minutes < 60) return `updated ${minutes}m ago`;
	if (minutes < 1_440) return `updated ${Math.round(minutes / 60)}h ago`;
	return `updated ${Math.round(minutes / 1_440)}d ago`;
}

function durationNs(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "unavailable";
	const ms = value / 1e6;
	return ms < 1 ? `${(ms * 1_000).toFixed(0)} µs` : `${ms.toFixed(ms < 100 ? 1 : 0)} ms`;
}

/** Server-rendered, script-free SVG suitable for README <img> embeds. */
export function renderGitHubCard(data: GitHubCardData, theme: "dark" | "light" = "dark"): string {
	const dark = theme === "dark";
	const colors = dark
		? { bg: "#09090b", panel: "#18181b", border: "#27272a", text: "#fafafa", muted: "#a1a1aa", accent: "#60a5fa", good: "#34d399" }
		: { bg: "#ffffff", panel: "#f4f4f5", border: "#e4e4e7", text: "#18181b", muted: "#71717a", accent: "#2563eb", good: "#059669" };
	const monitor = data.monitor?.windows.day;
	const latency = durationNs(monitor?.processing?.p99Ns);
	const health = monitor?.heartbeatAgeMs != null && monitor.heartbeatAgeMs <= 90_000 ? "HEALTHY" : monitor ? "STALE" : "UNAVAILABLE";
	const repoName = data.latestRepository ? escapeXml(data.latestRepository.name) : "No public repository data";
	const update = shortAge(data.latestRepository?.updatedAt ?? null, data.generatedAt);
	const timestamp = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short" }).format(data.generatedAt);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360" viewBox="0 0 900 360" role="img" aria-labelledby="title desc">
<title id="title">${escapeXml(data.username)} engineering monitor</title><desc id="desc">Live public GitHub and engineering diagnostic summary, generated ${escapeXml(timestamp)}</desc>
<rect width="900" height="360" rx="18" fill="${colors.bg}"/><rect x="1" y="1" width="898" height="358" rx="17" fill="none" stroke="${colors.border}"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"><text x="38" y="48" fill="${colors.text}" font-size="22" font-weight="700">${escapeXml(data.username).toUpperCase()}</text><text x="38" y="73" fill="${colors.muted}" font-size="12" letter-spacing="2">ENGINEERING MONITOR</text><circle cx="755" cy="43" r="6" fill="${health === "HEALTHY" ? colors.good : "#f59e0b"}"/><text x="770" y="48" fill="${colors.text}" font-size="12" font-weight="700">${health}</text><text x="38" y="105" fill="${colors.muted}" font-size="11">GENERATED ${escapeXml(timestamp)}</text>
<line x1="38" y1="125" x2="862" y2="125" stroke="${colors.border}"/>
<text x="38" y="157" fill="${colors.muted}" font-size="11" letter-spacing="1.5">GITHUB</text><text x="38" y="194" fill="${colors.text}" font-size="30" font-weight="700">${data.repositoryCount}</text><text x="38" y="216" fill="${colors.muted}" font-size="12">PUBLIC REPOSITORIES</text><text x="192" y="194" fill="${colors.text}" font-size="30" font-weight="700">${data.stars}</text><text x="192" y="216" fill="${colors.muted}" font-size="12">STARS</text><text x="302" y="194" fill="${colors.text}" font-size="30" font-weight="700">${data.forks}</text><text x="302" y="216" fill="${colors.muted}" font-size="12">FORKS</text>
<line x1="452" y1="145" x2="452" y2="308" stroke="${colors.border}"/><text x="484" y="157" fill="${colors.muted}" font-size="11" letter-spacing="1.5">ENGINEERING DIAGNOSTIC · 24H</text><text x="484" y="194" fill="${colors.accent}" font-size="30" font-weight="700">p99 ${escapeXml(latency)}</text><text x="484" y="216" fill="${colors.muted}" font-size="12">INPUT EVENT → DECISION</text><text x="484" y="256" fill="${colors.text}" font-size="15" font-weight="700">${monitor ? monitor.eventCount.toLocaleString() : "—"} events observed</text><text x="484" y="279" fill="${colors.muted}" font-size="12">${monitor?.heartbeatAgeMs != null ? `heartbeat ${Math.max(0, Math.round(monitor.heartbeatAgeMs / 1_000))}s ago` : "public telemetry unavailable"}</text>
<rect x="38" y="321" width="824" height="1" fill="${colors.border}"/><text x="38" y="345" fill="${colors.muted}" font-size="12">LATEST ACTIVITY</text><text x="173" y="345" fill="${colors.text}" font-size="12" font-weight="700">${repoName}</text><text x="520" y="345" fill="${colors.muted}" font-size="12">${escapeXml(update)}</text><text x="862" y="345" fill="${colors.accent}" font-size="12" text-anchor="end">LIVE DATA</text></g></svg>`;
}
