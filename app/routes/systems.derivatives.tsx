import type { MetaFunction } from "react-router";
import SystemsDiagnostic from "~/components/systems-diagnostic";

export const meta: MetaFunction = () => [
	{ title: "Quantitative Trading Engine — Lohit Aryan" },
	{ name: "description", content: "Production-shaped systems diagnostic for Lohit Aryan's quantitative trading engine." },
];

export default function DerivativesDiagnosticRoute() {
	return <SystemsDiagnostic view="report" />;
}
