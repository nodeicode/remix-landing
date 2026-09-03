import type { MetaFunction } from "react-router";
import {
	Links,
	Meta,
	Scripts,
	ScrollRestoration,
	Outlet,
	useOutletContext,
} from "react-router";
import { Dispatch, SetStateAction, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import "@radix-ui/themes/styles.css";
import "./root.css";
// import { StarsBackground } from "./components/stars";

export const meta: MetaFunction = () => {
	return [
		{ title: "Lohit Aryan" },
		{ name: "viewport", content: "width=device-width,initial-scale=1,viewport-fit=cover" },
		{
			name: "description",
			content:
				"Lohit Aryan — backend & applied-ML engineer pushing the limits of performance: low-latency systems, MLOps, and high-traffic services. Optimization is the brand; the site is the demo.",
		},
		// theme-color stays dark for the dark brand page
		// PWA Meta Tags
		{ name: "mobile-web-app-capable", content: "yes" },
		{ name: "apple-mobile-web-app-capable", content: "yes" },
		{ name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
		{ name: "apple-mobile-web-app-title", content: "Lohit Aryan" },
		{ name: "theme-color", content: "#09090b" },
		// iOS Splash Screens
		{ name: "apple-touch-fullscreen", content: "yes" },
	];
};

export default function App() {
	const [darkMode, setTheme] = useState(true);

	return (
		<html lang="en">
			<head>
				<Meta />
				<Links />
				{/* PWA Manifest */}
				<link rel="manifest" href="/manifest.json" />
				{/* Apple Touch Icons */}
				<link rel="apple-touch-icon" href="/favicon.ico" />
				<link rel="icon" type="image/x-icon" href="/favicon.ico" />
				{/* Preload images */}
				<link rel="preload" href="/talent-os-dark.svg" as="image" />
				<link rel="preload" href="/talent-os-light.svg" as="image" />
				<link rel="preload" href="/sales-os-dark.svg" as="image" />
				<link rel="preload" href="/sales-os-light.svg" as="image" />
				<Analytics />
				<SpeedInsights />
			</head>
			<body className={`${darkMode ? "dark" : ""} bg-light dark:bg-dark transition-all`}>
				{/* <StarsBackground
					starColor={darkMode ? "#fff" : "#000"}
					className="absolute inset-0 flex items-center justify-center rounded-xl"
				/> */}
				<Outlet context={{ darkMode, setTheme }} />
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}
export function useDarkMode() {
	return useOutletContext<{
		darkMode: boolean;
		setTheme: Dispatch<SetStateAction<boolean>>;
	}>();
}
