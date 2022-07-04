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
import { UserIcon, BriefcaseIcon } from "@heroicons/react/solid";

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
		return props.currentIcon === 0 ? <UserIcon {...p} /> : <BriefcaseIcon {...p} />;
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
					{props.currentIcon === 0 ? "About Me" : "My Work"}
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
		if (activeIcon === 0) {
			navigate("/", { replace: true });
		} else {
			navigate("/myWork", { replace: true });
		}
	}, [activeIcon]);
	const getIcon = (props: React.ComponentProps<"svg">) => {
		return darkMode ? <SunIcon {...props} /> : <MoonIcon {...props} />;
	};
	const getTextColor = (): string => {
		return darkMode ? "text-light" : "text-dark";
	};
	return (
		<div className="mb-8 flex w-72 justify-between">
			{getIcon({
				className: `ri-moon-fill h-12 w-8 transition-colors hover:cursor-pointer hover:text-gray ${getTextColor()}`,
				onClick: () => toggleTheme(),
			})}
			<div className="flex gap-4">
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
			</div>
		</div>
	);
};

export default function App() {
	const [darkMode, setTheme] = useState(false);
	const toggleTheme = () => {
		document.querySelector("body")?.classList.toggle("dark");
		setTheme(!darkMode);
	};
	return (
		<html lang="en">
			<head>
				<Meta />
				<Links />
			</head>
			<body>
				<div className="flex h-screen flex-col items-center gap-8 bg-light transition-all dark:bg-dark lg:flex-row lg:justify-center">
					<img
						src={darkMode ? "/coding_light.svg" : "/coding_dark.svg"}
						alt="coding"
						className="w-0 lg:w-[40vw]"
					/>
					<div className="prose prose-stone min-w-[40vw] p-7 font-mono prose-a:text-blue-600 dark:prose-invert dark:prose-a:text-dblue lg:h-3/6 lg:px-4 ">
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
