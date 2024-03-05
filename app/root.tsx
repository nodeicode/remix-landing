import type { MetaFunction } from "@remix-run/node";
import {
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useNavigate,
	useOutletContext,
} from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";
import styles from "./tailwind.css";
import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/solid";
import { UserIcon, BriefcaseIcon, BeakerIcon } from "@heroicons/react/solid";
import { Analytics } from "@vercel/analytics/react";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export const meta: MetaFunction = () => ({
	charset: "utf-8",
	title: "Lohit Aryan",
	viewport: "width=device-width,initial-scale=1",
	description: "Well this is a site about me, what else did you expect?",
});

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
				return "About Me";
			case 1:
				return "My Work";
			case 2:
				return "Projects";
		}
	};

	return (
		<div
			onClick={() => !active && props.setIcon(props.currentIcon)}
			className={`flex ${
				active ? "w-40 " : "w-12"
			} h-12 items-center gap-2 rounded-full px-2 outline outline-2  outline-dark transition-all duration-[450ms]  hover:cursor-pointer hover:text-gray hover:outline-gray dark:outline-gray-light  dark:hover:outline-gray`}
		>
			{getIcon({
				className: `h-12 w-8  ${props.textColor} text-inherit`,
			})}
			{active && (
				<p className="lead animate-fade-in leading-8 opacity-0   dark:text-gray-light">
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
	}, [activeIcon]);
	const getIcon = (props: React.ComponentProps<"svg">) => {
		return darkMode ? <SunIcon {...props} /> : <MoonIcon {...props} />;
	};
	const getTextColor = (): string => {
		return darkMode ? "text-light" : "text-dark";
	};
	return (
		<div className="mb-8 flex gap-4">
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
		document.querySelector("body")?.classList.toggle("dark");
		setTheme(!darkMode);
	};
	return (
		<html lang="en">
			<head>
				<Meta />
				<Links />
				<Analytics />
			</head>
			<body className="dark">
				<div className="flex min-h-screen flex-col gap-8 bg-light transition-all dark:bg-dark lg:flex-row lg:justify-center">
					{/* <img
						src={darkMode ? "/coding_light.svg" : "/coding_dark.svg"}
						alt="coding"
						className="w-0 lg:w-[40vw]"
					/> */}
					<div className="prose prose-stone min-w-[40vw] p-7 font-mono dark:prose-invert prose-a:text-blue-600 dark:prose-a:text-dblue lg:h-[50vh] lg:px-4 ">
						<Nav {...{ darkMode, toggleTheme }} />
						<Outlet context={{ darkMode, setTheme }} />
					</div>
				</div>
				<ScrollRestoration />
				<Scripts />
				<LiveReload />
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
