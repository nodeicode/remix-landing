"use client";
import { useCallback } from "react";

/*
 * HERO — clean, purely editorial typographic centerpiece.
 * No WebGL, no particle field — the design IS the type, spacing, and the
 * gold/dark palette. The strongest, most reliable version of the page.
 */
export function Hero() {
	// Smooth-scroll to a section by id (progressive enhancement on top of <a href="#id">).
	const smoothScroll = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
		const id = (e.currentTarget.getAttribute("href") || "").replace("#", "");
		if (!id) return;
		const el = document.getElementById(id);
		if (!el) return;
		e.preventDefault();
		el.scrollIntoView({ behavior: "smooth", block: "start" });
	}, []);

	return (
		<section
			id="hero"
			className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-8 text-center"
		>
			{/* soft radial backdrop — pure CSS, always clean */}
			<div
				className="pointer-events-none absolute inset-0"
				// style={{
				// 	background:
				// 		"radial-gradient(62% 55% at 50% 42%, #12151c 0%, #0b0d12 45%, #07080d 100%)",
				// }}
			/>
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.3]"
				style={{
					backgroundImage:
						"linear-gradient(rgba(255,214,150,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,214,150,0.05) 1px, transparent 1px)",
					backgroundSize: "72px 72px",
					maskImage: "radial-gradient(70% 60% at 50% 42%, #000 30%, transparent 78%)",
					WebkitMaskImage: "radial-gradient(70% 60% at 50% 42%, #000 30%, transparent 78%)",
				}}
			/>

			<div className="relative z-10">
				<p className="font-mono text-sm uppercase tracking-[0.34em] text-[#c9983f]">
					Backend · Applied ML · Systems
				</p>
				<h1
					id="hero-title"
					className="mt-6 font-extrabold leading-none tracking-tight text-white"
					style={{ fontSize: "clamp(3.4rem, 13vw, 11rem)" }}
				>
					Lohit&nbsp;Aryan
				</h1>
				<p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-[#c6cdd5] md:text-xl">
					Engineer, builder, and lifelong experimenter. <br />
					Most days you'll find me working on something, or unwinding with a game or an anime.
				</p>
				<div className="mt-9 flex flex-wrap items-center justify-center gap-3">
					<a
						href="#experience"
						onClick={smoothScroll}
						className="rounded-full bg-[#c9983f] px-7 py-3 text-sm font-semibold text-[#120c00] transition hover:bg-[#e0af4e]"
					>
						See experience
						<svg
							className="ml-2 inline-block h-4 w-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M12 5v14" />
							<path d="m19 12-7 7-7-7" />
						</svg>
					</a>
					<a
						href="#contact"
						onClick={smoothScroll}
						className="rounded-full border border-[#3a3f4a] px-7 py-3 text-sm font-semibold text-[#d7dce2] transition hover:border-[#c9983f]"
					>
						Get in touch
					</a>
				</div>
				<p className="mt-7 text-sm text-[#7d8791]">Atlanta, GA · open to work</p>
			</div>

			<div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.34em] text-[#5c6670]">
				Scroll
				<svg
					className="ml-1.5 inline-block h-3.5 w-3.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M12 5v14" />
					<path d="m19 12-7 7-7-7" />
				</svg>
			</div>
		</section>
	);
}
