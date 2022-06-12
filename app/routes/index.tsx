import type { LinksFunction, MetaFunction } from "@remix-run/react/routeModules";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSun, faMoon } from "@fortawesome/free-solid-svg-icons";
import TypewriterComponent from "typewriter-effect";

export const links: LinksFunction = () => {
	return [
		{
			rel: "preload",
			href: "/coding_light.svg",
			as: "image",
		},
		{
			rel: "preload",
			href: "/coding_dark.svg",
			as: "image",
		},
	];
};

export default function Index() {
	const [darkMode, setTheme] = useState(false);
	const getImage = (): string => {
		return darkMode ? "/coding_light.svg" : "/coding_dark.svg";
	};
	const getTextColor = (): string => {
		return darkMode ? "text-light" : "text-dark";
	};
	const toggleTheme = () => {
		document.querySelector("body")?.classList.toggle("dark");
		setTheme(!darkMode);
	};
	const getIcon = () => {
		return darkMode ? faSun : faMoon;
	};

	return (
		<div className="flex h-screen flex-col items-center justify-center gap-8 bg-light transition-all dark:bg-dark lg:flex-row">
			<img src={getImage()} alt="coding" className="w-0 lg:w-[40vw]" />
			<div className="prose prose-stone px-4 font-mono prose-a:text-blue-600 dark:prose-invert sm:px-2">
				<FontAwesomeIcon
					className={`w-10 transition-colors hover:cursor-pointer hover:text-gray ${getTextColor()}`}
					icon={getIcon()}
					onClick={() => toggleTheme()}
				/>
				<h2>Hello there! let me introduce myself</h2>
				<h1>
					I'm{" "}
					<TypewriterComponent
						onInit={(typewriter) => {
							typewriter
								.typeString("Lohit Aryan")
								.pauseFor(1000)
								.deleteAll()
								.typeString("a Web Dev")
								.pauseFor(1000)
								.deleteAll()
								.typeString("a Gamer")
								.pauseFor(1000)
								.deleteAll()
								.typeString("a Kpop fan")
								.pauseFor(500)
								.deleteAll()
								.typeString("Lohit Aryan")
								.pause()
								.start();
						}}
					/>
				</h1>
				<p className="lead">Turning some idea into a web app or just watching netflix</p>
				<p>
					Here is my{" "}
					<a rel="noopener" target="_blank" href="https://github.com/nodeicode">
						Github
					</a>{" "}
					its been quiet for a while there <br />
					<a rel="noopener" target="_blank" href="https://twitter.com/nodeicode">
						Twitter
					</a>{" "}
					casual convo?,{" "}
					<a rel="noopener" target="_blank" href="https://www.linkedin.com/in/lohit-aryan/">
						Linkedin
					</a>{" "}
					if that's your thing
				</p>
			</div>
		</div>
	);
}
