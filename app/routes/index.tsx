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

export default function Index() {
	return (
		<div className="animate-fade-in-fast">
			<h2>Hello there! let me introduce myself</h2>
			<h1>I'm Lohit Aryan</h1>
			<p className="lead">Turning some idea into a web app or just watching netflix</p>
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
