"use client";
import { motion, useReducedMotion } from "framer-motion";
import { Hero } from "./Hero";
import { BootVeil } from "./BootVeil";

/* ============================================================
   Content — updated from LohitAryan_Resume_FS (3).pdf
   (LinkedIn cross-check: lohit-aryan, Eleftheria Capital, TREC/Ezcaza)
   ============================================================ */

const EXPERIENCE = [
	{
		org: "Eleftheria Capital",
		role: "Software Engineer",
		date: "Jan 2026 — Present · Atlanta, GA",
		summary:
			"Engineered an end-to-end quantitative trading pipeline from alpha research to paper & live trading. Built a resilient event-driven pipeline (Kafka) bridging C++ data feeds with Python inference models + Temporal orchestration — sub-millisecond processing, 99.9% message-delivery reliability. Automated AWS infrastructure (Lambda/EventBridge, C++-optimized EC2) and full CI/CD via OpenTofu across GCP/AWS.",
		stack: ["C++", "Python", "Kafka", "Temporal", "AWS", "GCP", "Terraform", "OpenTofu"],
	},
	{
		org: "VPR — U of Maryland",
		role: "Machine Learning Engineer",
		date: "Mar 2025 — Dec 2025",
		summary:
			"Built the 0-to-1 architecture of an automated AI compliance system: a Retrieval-Augmented Generation (RAG) + ReAct LLM pipeline (LangGraph) processing massive unstructured data — cutting federal compliance check time by 90%. Shipped a React/Next.js frontend with strict code-level guardrails, observability & evals that minimized hallucinations and ensured production-ready responses.",
		stack: ["LangGraph", "RAG", "LLMs", "Next.js", "React", "AWS Bedrock"],
	},
	{
		org: "AREC — U of Maryland Extension",
		role: "Software Engineer",
		date: "Jun 2024 — Mar 2025",
		summary:
			"Architected a highly-available serverless cloud infrastructure on AWS (Amplify, DynamoDB) and designed a data-driven UI incorporating ArcGIS maps and custom layer configs to process spatial sensor data — responsive, performant visualizations that improved analysis efficiency for farmers.",
		stack: ["Next.js", "AWS Amplify", "DynamoDB", "ArcGIS", "Mapbox GL JS"],
	},
	{
		org: "ZoomInfo",
		role: "Software Engineer",
		date: "Jun 2021 — Jan 2024",
		summary:
			"Shipped full-stack vertical slices coupling React/Angular micro-frontends with scalable Python/Node backends (BFF pattern). Owned high-traffic intent microservices on a Kafka backbone processing millions of B2B signals daily for 35,000+ orgs — reduced backend p99 latency by 15%, raised DAU retention 22%, and drove Playwright/Selenium E2E automation in CI/CD.",
		stack: ["React", "Angular", "NestJS", "Spring Boot", "Kafka", "Playwright", "GCP"],
	},
];

const INTRO_CHIPS = [
	"Modern web applications",
	"Scalable backend architectures",
	"AI / LLM workflows",
	"Product-driven",
];

const SKILLS = [
	{
		g: "Languages",
		items: ["JavaScript", "TypeScript", "Python", "C++", "Java", "SQL", "Node.js"],
	},
	{
		g: "Web & Backend",
		items: ["React", "Next.js", "NestJS", "Express", "Spring Boot", "Flask", "Mapbox GL"],
	},
	{
		g: "Data & ML",
		items: [
			"LangChain",
			"RAG",
			"LangGraph",
			"LLMs",
			"Milvus",
			"Postgres",
			"Kafka",
			"Temporal",
		],
	},
	{
		g: "Cloud & Infra",
		items: ["GCP", "AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Datadog"],
	},
];

const CONTACT = [
	["Email", "mailto:lohitaryan20@gmail.com", "lohitaryan20@gmail.com"],
	["GitHub", "https://github.com/nodeicode"],
	["LinkedIn", "https://www.linkedin.com/in/lohit-aryan/"],
	["Twitter/X", "https://twitter.com/nodeicode"],
];

function FadeIn({
	children,
	delay = 0,
	className = "",
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}) {
	const reduce = useReducedMotion();
	return (
		<motion.div
			className={className}
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26 }}
			whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-12% 0px" }}
			transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
		>
			{children}
		</motion.div>
	);
}

function SectionHead({ index, title, id }: { index: string; title: string; id: string }) {
	return (
		<div className="mb-12 flex items-baseline gap-4">
			<span className="font-mono text-sm text-[#c9983f]">{index}</span>
			<h2
				id={id}
				className="scroll-mt-8 text-3xl font-bold tracking-tight text-white md:text-5xl"
			>
				{title}
			</h2>
		</div>
	);
}

export function BrandPage() {
	return (
		<div className="relative min-h-screen text-[#e5e9ef]">
			<BootVeil />
			<div className="relative z-10">
				<Hero />

				{/* ===== About line (right under hero) ===== */}
				<section
					id="intro"
					className="relative mx-auto max-w-3xl px-8 py-28 text-center md:px-10"
				>
					<FadeIn>
						<p className="text-xl leading-relaxed text-[#c6cdd5] md:text-2xl">
							Product-driven full-stack developer with 4+ years of industry experience
							specializing in modern web applications, scalable backend architectures, and
							AI/LLM workflows. I got into software to understand how systems work under
							pressure — and I've stayed because the problems keep getting harder.
						</p>
					</FadeIn>
				</section>

				{/* ===== What I work on ===== */}
				<section className="relative mx-auto max-w-5xl px-6 py-24 md:px-10">
					<FadeIn>
						<SectionHead id="what-i-work-on" index="01" title="What I work on" />
						<p className="max-w-3xl text-xl leading-relaxed text-[#b9c0ca]">
							Dependable infrastructure, quantitative systems, and practical ML — built for
							high-traffic data products, with a user-centric lifecycle and automated testing.
						</p>
						<div className="mt-8 flex flex-wrap gap-2">
							{INTRO_CHIPS.map((c) => (
								<span
									key={c}
									className="rounded-full border border-[#c9983f]/40 px-4 py-1.5 text-sm text-[#d7a447]"
								>
									{c}
								</span>
							))}
						</div>
					</FadeIn>
				</section>

				{/* ===== Experience ===== */}
				<section id="experience" className="relative mx-auto max-w-5xl px-6 py-24 md:px-10">
					<FadeIn>
						<SectionHead id="experience-title" index="02" title="Experience" />
					</FadeIn>
					<div className="space-y-8">
						{EXPERIENCE.map((x, i) => (
							<FadeIn key={x.org} delay={0.04 * i}>
								<div className="group rounded-lg border border-[#242a33] bg-[#0b0d12]/85 p-7 transition-colors hover:border-[#c9983f]/60 hover:bg-[#10131a] md:p-8">
									<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
										<h3 className="text-xl font-semibold text-white">{x.org}</h3>
										<span className="font-mono text-xs text-[#7d8791]">{x.date}</span>
									</div>
									<p className="mt-1 text-sm text-[#c9983f]">{x.role}</p>
									<p className="mt-4 text-[15px] leading-relaxed text-[#b9c0ca]">
										{x.summary}
									</p>
									<div className="mt-5 flex flex-wrap gap-2">
										{(x.stack || []).map((s) => (
											<span
												key={s}
												className="rounded-full border border-[#2c323c] px-3 py-1 font-mono text-xs text-[#9aa4b0]"
											>
												{s}
											</span>
										))}
									</div>
								</div>
							</FadeIn>
						))}
					</div>
					<FadeIn delay={0.1}>
						<p className="mt-10 text-sm leading-relaxed text-[#7d8791]">
							<em>Also:</em> Technical Lead (CTO) at{" "}
							<span className="text-[#aeb6c0]">TREC LLC / Ezcaza</span> — custom JWT auth
							scheme and a neural recommender model.
						</p>
					</FadeIn>
				</section>

				{/* ===== Skills ===== */}
				<section id="skills" className="relative mx-auto max-w-5xl px-6 py-24 md:px-10">
					<FadeIn>
						<SectionHead id="skills-title" index="03" title="Skills" />
					</FadeIn>
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
						{SKILLS.map((s, i) => (
							<FadeIn key={s.g} delay={0.05 * i}>
								<div className="rounded-lg border border-[#242a33] bg-[#0b0d12]/85 p-6">
									<h3 className="text-sm font-semibold uppercase tracking-wider text-[#c9983f]">
										{s.g}
									</h3>
									<ul className="mt-4 space-y-2">
										{s.items.map((it) => (
											<li key={it} className="text-sm text-[#aeb6c0]">
												{it}
											</li>
										))}
									</ul>
								</div>
							</FadeIn>
						))}
					</div>
				</section>

				{/* ===== Education ===== */}
				<section className="relative mx-auto max-w-5xl px-6 py-24 md:px-10">
					<FadeIn className="max-w-3xl">
						<SectionHead id="education-title" index="04" title="Education" />
						<div className="space-y-6">
							<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[#242a33] pb-3">
								<h3 className="text-lg font-semibold text-white">
									M.S. Applied Machine Learning
								</h3>
								<span className="font-mono text-xs text-[#7d8791]">
									UMD College Park · 12/2025
								</span>
							</div>
							<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
								<h3 className="text-lg font-semibold text-white">B.S. Computer Science</h3>
								<span className="font-mono text-xs text-[#7d8791]">
									Univ. of Illinois (UIC) · 12/2020
								</span>
							</div>
						</div>
					</FadeIn>
				</section>

				{/* ===== Contact ===== */}
				<section
					id="contact"
					className="relative mx-auto max-w-5xl border-t border-[#242a33] px-6 py-24 md:px-10"
				>
					<FadeIn>
						<SectionHead id="contact-title" index="05" title="Contact" />
					</FadeIn>
					<div className="flex flex-wrap gap-4">
						{CONTACT.map(([label, href]) => (
							<a
								key={label}
								href={href}
								target="_blank"
								rel="noopener"
								className="rounded-full border border-[#3a3f4a] px-5 py-2.5 text-sm font-medium text-[#d7dce2] transition hover:border-[#c9983f] hover:text-white"
							>
								{label}
								<svg
									className="ml-1 inline-block h-3.5 w-3.5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M7 17 17 7" />
									<path d="M8 7h9v9" />
								</svg>
							</a>
						))}
					</div>
					<p className="mt-10 text-sm text-[#7d8791]">
						© {new Date().getFullYear()} Lohit Aryan Gopikonda · Atlanta, GA
					</p>
				</section>
			</div>
		</div>
	);
}
