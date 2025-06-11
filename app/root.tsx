import type { MetaFunction } from "react-router";
import {
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  Outlet,
  useOutletContext,
} from "react-router";
import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/solid";
import { UserIcon, BriefcaseIcon, BeakerIcon } from "@heroicons/react/solid";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { motion } from "framer-motion";

import "@radix-ui/themes/styles.css"
import "./root.css";

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

const NavIcon = (props: {
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

    const scrollToSection = () => {
        if (!active) {
            const sectionIds = ['about', 'work', 'projects'];
            const targetId = sectionIds[props.currentIcon];
            const element = document.getElementById(targetId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            props.setIcon(props.currentIcon);
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

const Nav = ({
    darkMode,
    toggleTheme,
    activeIcon,
    setIcon,
}: {
    darkMode: boolean;
    toggleTheme: () => void;
    activeIcon: number;
    setIcon: Dispatch<SetStateAction<number>>;
}) => {
    const getIcon = (props: React.ComponentProps<"svg">) => {
        return darkMode ? <SunIcon {...props} /> : <MoonIcon {...props} />;
    };
    const getTextColor = (): string => {
        return darkMode ? "text-light" : "text-dark";
    };
    return (
        <div className="mb-8 py-8 flex flex-col gap-4 items-center">
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
    const [activeSection, setActiveSection] = useState(0);

    const toggleTheme = () => {
        setTheme(!darkMode);
    };

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
            <body className={`${darkMode ? "dark" : ""} max-w-screen max-h-screen overflow-hidden bg-light dark:bg-dark transition-all`}>
                <div className="flex flex-col gap-7 bg-light dark:bg-dark lg:flex-row justify-center items-center p-7 py-[5vh] relative z-10">
                    <div className="prose prose-sm md:prose-base lg:prose-lg flex flex-row-reverse gap-2 md:gap-6 min-w-[50vw]! prose-stone font-mono dark:prose-invert prose-a:text-blue-600 dark:prose-a:text-dblue lg:px-4">
                        <Nav 
                            activeIcon={activeSection}
                            setIcon={setActiveSection}
                            {...{ darkMode, toggleTheme }} 
                        />
                        <Outlet />
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
