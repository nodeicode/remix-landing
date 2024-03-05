import type { LinksFunction } from "@remix-run/react/routeModules";

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

const getRandomLeadQuote = (): string => {
	const quotes = [
		"Turning some idea into a web app or just watching netflix",
		"Grinding Assignments, applying to jobs or just watching anime",
		"Tweaking algorithms, spamming applications, with K-drama or gaming as my cheat days.",
		"Engineering the future, one job application at a time or on my playstation.",
		"Building apps, chasing jobs, or getting lost in anime plots",
		"Crafting code, curating resumes or tasting the town's best eats.",
	];
	const getRandomInt = (max: number) => {
		return Math.floor(Math.random() * max);
	};
	return quotes[getRandomInt(quotes.length)];
};

export default function Index() {
	return (
		<div className="animate-fade-in-fast">
			<h2>Hello there! let me introduce myself</h2>
			<h1>I'm Lohit Aryan</h1>
			<p className="lead">{getRandomLeadQuote()}</p>
			<p>
				Here is my{" "}
				<a rel="noopener" target="_blank" href="https://github.com/nodeicode">
					Github
				</a>{" "}
				its been quiet for a while there, <br />
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
	);
}
