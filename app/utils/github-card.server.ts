import type { PublicMonitorSummary } from "~/utils/public-monitor";

export type EngineeringCardData = {
	generatedAt: number;
	monitor: Pick<PublicMonitorSummary, "asOfMs" | "windows"> | null;
};

function escapeXml(value: string): string {
	return value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&quot;", "'": "&apos;" })[character] ?? character);
}

function durationNs(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "";
	const ms = value / 1e6;
	return ms < 1 ? `${(ms * 1_000).toFixed(0)} µs` : `${ms.toFixed(ms < 100 ? 1 : 0)} ms`;
}

function utcDateTime(value: number): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "UTC",
		timeZoneName: "short",
	}).format(value);
}

/** Server-rendered, script-free SVG suitable for README <img> embeds. */
export function renderEngineeringCard(data: EngineeringCardData, theme: "dark" | "light" = "dark"): string {
	const dark = theme === "dark";
	const colors = dark
		? { bg: "#09090b", panel: "#18181b", panelAlt: "#111113", border: "#27272a", text: "#fafafa", muted: "#a1a1aa", accent: "#60a5fa", good: "#34d399", warning: "#fbbf24" }
		: { bg: "#ffffff", panel: "#f4f4f5", panelAlt: "#fafafa", border: "#e4e4e7", text: "#18181b", muted: "#71717a", accent: "#2563eb", good: "#059669", warning: "#d97706" };
	const day = data.monitor?.windows.day ?? null;
	const week = data.monitor?.windows.week ?? null;
	const reference = day?.processing?.p99Ns != null ? day : week?.processing?.p99Ns != null ? week : null;
	const referenceLabel = reference === day ? "24H WINDOW" : reference === week ? "7D REFERENCE" : "NO 7D SAMPLES";
	const hasLatency = reference?.processing?.p99Ns != null;
	const telemetryHealthy = day?.heartbeatAgeMs != null && day.heartbeatAgeMs <= 90_000;
	const health = telemetryHealthy ? "HEALTHY" : day ? "STALE" : "NO DATA";
	const healthColor = telemetryHealthy ? colors.good : day ? colors.warning : colors.muted;
	const timestamp = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short" }).format(data.generatedAt);
	const latency = durationNs(reference?.processing?.p99Ns);
	const latencyWidth = hasLatency ? Math.max(40, Math.min(220, 220 - Math.log10((reference?.processing?.p99Ns ?? 1) / 1e3) * 31)) : 0;
	const lastCheck = day?.heartbeatAgeMs != null ? utcDateTime(data.generatedAt - day.heartbeatAgeMs) : null;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="482" viewBox="0 0 900 482" role="img" aria-labelledby="title desc">
<title id="title">Lohit Aryan engineering portfolio</title><desc id="desc">Public engineering portfolio and live system diagnostic, generated ${escapeXml(timestamp)}</desc>
<rect width="900" height="482" rx="18" fill="${colors.bg}"/><rect x="1" y="1" width="898" height="480" rx="17" fill="none" stroke="${colors.border}"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"><text x="38" y="47" fill="${colors.text}" font-size="22" font-weight="700">LOHIT ARYAN</text><text x="38" y="71" fill="${colors.muted}" font-size="11" letter-spacing="2">ENGINEERING PORTFOLIO</text><circle cx="724" cy="42" r="6" fill="${colors.good}"/><text x="739" y="47" fill="${colors.text}" font-size="12" font-weight="700">PUBLIC CARD</text><text x="38" y="105" fill="${colors.muted}" font-size="11">REFRESHED ${escapeXml(timestamp)}</text>
<line x1="38" y1="125" x2="862" y2="125" stroke="${colors.border}"/>
<text x="38" y="157" fill="${colors.muted}" font-size="11" letter-spacing="1.5">ENGINEERING FOCUS</text>
<rect x="38" y="174" width="190" height="100" rx="10" fill="${colors.panel}"/><text x="56" y="203" fill="${colors.accent}" font-size="11" font-weight="700">BACKEND SYSTEMS</text><text x="56" y="231" fill="${colors.text}" font-size="12">Dependable services</text><text x="56" y="252" fill="${colors.muted}" font-size="11">and data pipelines</text>
<rect x="242" y="174" width="190" height="100" rx="10" fill="${colors.panel}"/><text x="260" y="203" fill="${colors.accent}" font-size="11" font-weight="700">APPLIED ML</text><text x="260" y="231" fill="${colors.text}" font-size="12">Research automation</text><text x="260" y="252" fill="${colors.muted}" font-size="11">and practical models</text>
<rect x="446" y="174" width="190" height="100" rx="10" fill="${colors.panel}"/><text x="464" y="203" fill="${colors.accent}" font-size="11" font-weight="700">CLOUD &amp; DATA</text><text x="464" y="231" fill="${colors.text}" font-size="12">AWS, databases,</text><text x="464" y="252" fill="${colors.muted}" font-size="11">and observability</text>
<rect x="650" y="174" width="212" height="100" rx="10" fill="${colors.panel}"/><text x="668" y="203" fill="${colors.accent}" font-size="11" font-weight="700">PRODUCT ENGINEERING</text><text x="668" y="231" fill="${colors.text}" font-size="12">Tools that turn data</text><text x="668" y="252" fill="${colors.muted}" font-size="11">into useful decisions</text>
<text x="38" y="313" fill="${colors.muted}" font-size="11" letter-spacing="1.5">PUBLIC SYSTEM DIAGNOSTIC</text><rect x="38" y="330" width="824" height="105" rx="10" fill="${colors.panelAlt}" stroke="${colors.border}"/>
<circle cx="63" cy="358" r="5" fill="${healthColor}"/><text x="78" y="362" fill="${colors.text}" font-size="12" font-weight="700">${health}</text><text x="78" y="383" fill="${colors.muted}" font-size="11">${lastCheck ? `last heartbeat: ${escapeXml(lastCheck)}` : "no public heartbeat timestamp recorded"}</text>
${hasLatency ? `<text x="311" y="362" fill="${colors.text}" font-size="13" font-weight="700">p99 ${latency}</text><text x="311" y="383" fill="${colors.muted}" font-size="11">${referenceLabel} · input event → decision</text><rect x="311" y="399" width="220" height="5" rx="2.5" fill="${colors.border}"/><rect x="311" y="399" width="${latencyWidth}" height="5" rx="2.5" fill="${colors.accent}"/>` : `<text x="311" y="362" fill="${colors.text}" font-size="13" font-weight="700">No public latency samples</text><text x="311" y="383" fill="${colors.muted}" font-size="11">7-day reference checked · no metric published</text>`}
${reference ? `<text x="586" y="362" fill="${colors.text}" font-size="13" font-weight="700">${reference.eventCount.toLocaleString()} events</text><text x="586" y="383" fill="${colors.muted}" font-size="11">${referenceLabel} · aggregate only</text>` : ""}
<line x1="38" y1="454" x2="862" y2="454" stroke="${colors.border}"/><text x="38" y="474" fill="${colors.muted}" font-size="10">BACKEND · ML · CLOUD · PRODUCT SYSTEMS</text><text x="862" y="474" fill="${colors.accent}" font-size="10" text-anchor="end">LOHITARYAN.DEV</text></g></svg>`;
}
