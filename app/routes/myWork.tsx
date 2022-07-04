import { LinksFunction } from "@remix-run/node";
import { useDarkMode } from "~/root";

export const links: LinksFunction = () => {
	return [
		{
			rel: "preload",
			href: "/talent-os-dark.svg",
			as: "image",
		},
		{
			rel: "preload",
			href: "/talent-os-light.svg",
			as: "image",
		},
	];
};

export default function myWork() {
	const { darkMode } = useDarkMode();
	return (
		<div className="animate-fade-in-fast">
			<h2>
				Software Engineer @{" "}
				<a rel="noopener" target="_blank" href="https://www.zoominfo.com/">
					Zoominfo
				</a>{" "}
			</h2>
			<p>
				Working on the{" "}
				<img
					src={darkMode ? "/talent-os-dark.svg" : "/talent-os-light.svg"}
					alt="Talent OS"
					className="my-0 inline-block h-7"
				></img>{" "}
				platform, <br /> we leverage zoominfo's best in class contact data and provide
				recruiters with an end-to-end pipeline, from sourcing a candidate, all the way to
				hiring!{" "}
			</p>
			<p>Stack: AngularJS, Groovy, Apache Solr</p>
			<h2>
				Chief Technical Officer @{" "}
				<a rel="noopener" target="_blank" href="https://staging.ezcaza.com/">
					Ezcaza
				</a>{" "}
			</h2>
			<p>
				Bringing real estate to the 21st century, <br /> our vision is to change how real
				estate tranasctions are managed by title companies and real estate vendors.
			</p>
			<p>Stack: NextJS, Express.js, MySQL </p>
		</div>
	);
}
