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
import { StarsBackground } from "./components/stars";

export const meta: MetaFunction = () => {
	return [
		{ title: "Lohit Aryan" },
		{ name: "viewport", content: "width=device-width,initial-scale=1" },
		{
			name: "description",
			content: "Well this is a site about me, what else did you expect?",
		},
	];
};

export default function App() {
	const [darkMode, setTheme] = useState(true);

	return (
		<html lang="en">
			<head>
				<Meta />
				<Links />
				<link rel="preload" href="/talent-os-dark.svg" as="image" />
				<link rel="preload" href="/talent-os-light.svg" as="image" />
				<link rel="preload" href="/sales-os-dark.svg" as="image" />
				<link rel="preload" href="/sales-os-light.svg" as="image" />
				<Analytics />
				<SpeedInsights />
			</head>
			<body
				className={`${
					darkMode ? "dark" : ""
				} max-w-screen max-h-screen overflow-hidden pt-[4vh] lg:pt-[2vh]  bg-light dark:bg-dark transition-all`}
			>
				<StarsBackground
					starColor={darkMode ? "#fff" : "#000"}
					className="absolute inset-0 flex items-center justify-center rounded-xl"
				/>
				<div className="flex flex-col gap-7 overflow-hidden bg-light dark:bg-dark lg:flex-row justify-center items-center px-4 relative z-10">
					<div className="prose prose-sm md:prose-base lg:prose-lg flex flex-row-reverse md:gap-6 min-w-[50vw]! overflow-hidden prose-stone font-mono dark:prose-invert prose-a:text-blue-600 dark:prose-a:text-dblue lg:px-4">
						<Outlet context={{ darkMode, setTheme }} />
					</div>
				</div>
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
