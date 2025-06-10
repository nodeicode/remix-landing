import type { MetaFunction } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
  useOutletContext,
} from "react-router";
// import type { LinksFunction } from "react-router";
import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/solid";
import { UserIcon, BriefcaseIcon, BeakerIcon } from "@heroicons/react/solid";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";


import "@radix-ui/themes/styles.css"
import "./root.css";

// export const links: LinksFunction = () => {
// 	return [
// 		{
// 			rel: "preload",
// 			href: "/coding_light.svg",
// 			as: "image",
// 		},
// 		{
// 			rel: "preload",
// 			href: "/coding_dark.svg",
// 			as: "image",
// 		},
// 	];
// };

export const meta: MetaFunction = () => {
	return [
		{ title: "Lohit Aryan" },
		{ name: "viewport", content: "width=device-width,initial-scale=1" },
		{
			name: "description",
			content: "Well this is a site about me, what else did you expect?",
		},
	];
}


export const NavIcon = (props: {
	textColor: string;
	activeIcon: number;
	currentIcon: number;
	setIcon: Dispatch<SetStateAction<number>>;
}) => {
	const [active, setActive] = useState(false);
	useEffect(() => {
		setActive(props.currentIcon === props.activeIcon);
	});

	const getIcon = (p: React.ComponentProps<"svg">) => {
		switch (props.currentIcon) {
			case 0:
			default:
				return <UserIcon {...p} />;
			case 1:
				return <BriefcaseIcon {...p} />;
			case 2:
				return <BeakerIcon {...p} />;
		}
	};

	const getText = () => {
		switch (props.currentIcon) {
			case 0:
			default:
				return "About";
			case 1:
				return "Work";
			case 2:
				return "Projects";
		}
	};

	return (
		<div
			onClick={() => !active && props.setIcon(props.currentIcon)}
			className={`flex flex-col ${
				active ? "h-48 " : "h-8 md:h-12"
			} w-8 md:w-12 items-center rounded-full px-2 outline outline-2  outline-dark transition-all duration-[450ms]  hover:cursor-pointer hover:text-gray hover:outline-gray dark:outline-gray-light  dark:hover:outline-gray`}
		>
			{getIcon({
				className: `h-12 w-6 md:w-8  ${props.textColor} text-inherit`,
			})}
			{active && (
				<p className="lead animate-fade-in leading-8 opacity-0  dark:text-gray-light [writing-mode:vertical-rl]">
					{getText()}
				</p>
			)}
		</div>
	);
};

export const Nav = ({
	darkMode,
	toggleTheme,
}: {
	darkMode: boolean;
	toggleTheme: () => void;
}) => {
	const [activeIcon, setIcon] = useState(0);
	const navigate = useNavigate();
	useEffect(() => {
		try{
		switch (activeIcon) {
			case 0:
			default:
				navigate("/", { replace: true });
				break;
			case 1:
				navigate("/myWork", { replace: true });
				break;
			case 2:
				navigate("/projects", { replace: true });
				break;
		}
		} catch (e) {
			console.error("Error navigating to the route:", e);
		}
	}, [activeIcon]);
	const getIcon = (props: React.ComponentProps<"svg">) => {
		return darkMode ? <SunIcon {...props} /> : <MoonIcon {...props} />;
	};
	const getTextColor = (): string => {
		return darkMode ? "text-light" : "text-dark";
	};
	return (
		<div className="mb-8 flex flex-col gap-4 items-center">
			{getIcon({
				className: `ri-moon-fill h-12 w-8 transition-colors hover:cursor-pointer hover:text-gray ${getTextColor()}`,
				onClick: () => toggleTheme(),
			})}
			<NavIcon
				textColor={getTextColor()}
				activeIcon={activeIcon}
				setIcon={setIcon}
				currentIcon={0}
			/>
			<NavIcon
				textColor={getTextColor()}
				activeIcon={activeIcon}
				setIcon={setIcon}
				currentIcon={1}
			/>
			<NavIcon
				textColor={getTextColor()}
				activeIcon={activeIcon}
				setIcon={setIcon}
				currentIcon={2}
			/>
		</div>
	);
};

export default function App() {
	const [darkMode, setTheme] = useState(true);
	const toggleTheme = () => {
		// document.querySelector("body")?.classList.toggle("dark");
		setTheme(!darkMode);
	};
	return (
		<html lang="en">
			<head>
				<Meta />
				<Links />
				<Analytics />
				<SpeedInsights />
			</head>
			<body className={`${darkMode ? "dark" : ""} max-w-screen max-h-screen`}>
				<div className="flex flex-col gap-7 bg-light transition-all dark:bg-dark lg:flex-row justify-center items-center">
					{/* <img
						src={darkMode ? "/coding_light.svg" : "/coding_dark.svg"}
						alt="coding"
						className="w-0 lg:w-[40vw]"
					/> */}
					<div className="prose prose-sm md:prose-base lg:prose-lg flex flex-row-reverse gap-2 md:gap-6 min-w-[50vw]! prose-stone p-7 font-mono dark:prose-invert prose-a:text-blue-600 dark:prose-a:text-dblue lg:px-4 ">
						<Nav {...{ darkMode, toggleTheme }} />
						<div className="lg:h-[80vh] lg:overflow-y-auto pr-2">
						<Outlet context={{ darkMode, setTheme }} />
						</div>
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
