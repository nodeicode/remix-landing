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
