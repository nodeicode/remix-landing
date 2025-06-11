import { useState, useEffect } from "react";

const quotes = [
	"Turning some idea into a web app or just watching netflix",
	"Grinding Assignments, applying to jobs or just watching anime",
	"Tweaking algorithms, spamming applications, with K-drama or gaming as my cheat days.",
	"Engineering the future, one job application at a time or on my playstation.",
	"Building apps, chasing jobs, or getting lost in anime plots",
	"Crafting code, curating resumes or tasting the town's best eats.",
];

export default function Index() {
	const [leadQuote, setLeadQuote] = useState(quotes[0]); // Use first quote as default

	useEffect(() => {
		// Only randomize on client after hydration
		const getRandomInt = (max: number) => {
			return Math.floor(Math.random() * max);
		};
		setLeadQuote(quotes[getRandomInt(quotes.length)]);
	}, []);

	return (
		<div className="animate-fade-in-fast">
			<h2>Hello there! let me introduce myself</h2>
			<h1>I'm Lohit Aryan</h1>
			<p className="lead">{leadQuote}</p>
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
