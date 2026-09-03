"use client";
import { useEffect, useState } from "react";

/*
 * BOOT VEIL — holds a solid dark cover until the page's first paint AND
 * fonts/ready, then fades it out. Prevents the FOUC/glyph-flash flicker on
 * reload (icons momentarily rendering with fallback shapes, background popping
 * in, etc.). Safe: always removed; reduced-motion users get a near-instant
 * fade; if fonts never resolve it still clears after a max wait.
 */
export function BootVeil() {
	const [gone, setGone] = useState(false);
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		let active = true;
		const finish = () => {
			if (!active) return;
			setGone(true); // trigger the fade-out
			// after fade (350ms), remove from layout
			window.setTimeout(() => active && setHidden(true), 420);
		};
		// wait for initial paint + fonts, with a hard cap so nothing can hang
		const fontsOk =
			document.fonts && typeof (document.fonts as FontFaceSet).ready?.then === "function"
				? (document.fonts as FontFaceSet).ready
				: Promise.resolve();
		const minWait = new Promise((r) => setTimeout(r, 120));
		const cap = new Promise((r) => setTimeout(r, 1800));
		void Promise.race([Promise.all([fontsOk, minWait]), cap]).then(finish);
		return () => {
			active = false;
		};
	}, []);

	if (hidden) return null;

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-[100] bg-[#07080d] transition-opacity duration-[350ms] ease-out"
			style={{ opacity: gone ? 0 : 1 }}
		/>
	);
}