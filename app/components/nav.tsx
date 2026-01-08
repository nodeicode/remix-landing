import { MoonIcon, SunIcon } from "@heroicons/react/solid";
import { UserIcon, BriefcaseIcon, BeakerIcon, ChartBarIcon } from "@heroicons/react/solid";
import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { Link } from "react-router";

const NavIcon = (props: {
	textColor: string;
	activeIcon: number;
	currentIcon: number;
	setIcon: Dispatch<SetStateAction<number>>;
	onManualScroll?: (index: number) => void;
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
		}
	};

	const getText = () => {
		switch (props.currentIcon) {
			case 0:
			default:
				return "About";
			case 1:
				return "Work";
		}
	};

	const scrollToSection = () => {
		if (!active) {
			const sectionIds = ["about", "work"];
			const targetId = sectionIds[props.currentIcon];
			const element = document.getElementById(targetId);
			if (element) {
				if (props.onManualScroll) {
					props.onManualScroll(props.currentIcon);
				}
				element.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		}
	};

	return (
		<div
			onClick={scrollToSection}
			className={`flex flex-col ${
				active ? "h-48 " : "h-8 md:h-12"
			} w-8 md:w-12 items-center rounded-full px-2 outline-2  outline-dark transition-all duration-[450ms]  hover:cursor-pointer hover:text-gray hover:outline-gray dark:outline-gray-light  dark:hover:outline-gray`}
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

export default function Nav({
	darkMode,
	toggleTheme,
	activeIcon,
	setIcon,
	onManualScroll,
}: {
	darkMode: boolean;
	toggleTheme: () => void;
	activeIcon: number;
	setIcon: Dispatch<SetStateAction<number>>;
	onManualScroll?: (index: number) => void;
}) {
	const getIcon = (props: React.ComponentProps<"svg">) => {
		return darkMode ? <SunIcon {...props} /> : <MoonIcon {...props} />;
	};
	const getTextColor = (): string => {
		return darkMode ? "text-light" : "text-dark";
	};
	return (
		<div className=" min-w-10 mb-8 py-8 flex flex-col gap-4 items-center">
			{getIcon({
				className: `ri-moon-fill h-12 w-8 transition-colors hover:cursor-pointer hover:text-gray ${getTextColor()}`,
				onClick: () => toggleTheme(),
			})}
			{/* <Link
				to="/dashboard"
				className="flex h-8 md:h-12 w-8 md:w-12 items-center justify-center rounded-full outline-2 outline-dark transition-all duration-[450ms] hover:cursor-pointer hover:text-gray hover:outline-gray dark:outline-gray-light dark:hover:outline-gray"
			>
				<ChartBarIcon className={`h-12 w-6 md:w-8 ${getTextColor()} text-inherit`} />
			</Link> */}
			<NavIcon
				textColor={getTextColor()}
				activeIcon={activeIcon}
				setIcon={setIcon}
				onManualScroll={onManualScroll}
				currentIcon={0}
			/>
			<NavIcon
				textColor={getTextColor()}
				activeIcon={activeIcon}
				setIcon={setIcon}
				onManualScroll={onManualScroll}
				currentIcon={1}
			/>
		</div>
	);
}
