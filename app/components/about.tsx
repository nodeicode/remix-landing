import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronDoubleDownIcon } from "@heroicons/react/solid";

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
			{/* Keep Scrolling Indicator */}
			<motion.div
				className="flex flex-col mt-16 items-center text-gray-500 dark:text-gray-400 pointer-events-none"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 1.2, duration: 0.5 }} // Delay to appear after main content
			>
				<p>Keep scrolling</p>
				<motion.div
					animate={{ y: [0, 10, 0] }} // Stays a 10px movement down and back up
					transition={{
						duration: 1.5,
						repeat: Infinity,
						ease: [0.68, -0.55, 0.265, 1.55], // easeInOutBack - creates an overshoot effect
					}}
				>
					<ChevronDoubleDownIcon className="h-6 w-6 mt-1" />
				</motion.div>
			</motion.div>
		</div>
	);
}
