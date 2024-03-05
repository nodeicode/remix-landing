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
				Ex - Software Engineer @{" "}
				<a rel="noopener" target="_blank" href="https://www.zoominfo.com/">
					Zoominfo
				</a>{" "}
			</h2>
			<p>
				<s>Working</s> Worked on the{" "}
				<img
					src={darkMode ? "/talent-os-dark.svg" : "/talent-os-light.svg"}
					alt="Talent OS"
					className="my-0 inline-block h-7"
				></img>{" "}
				and{" "}
				<img
					src={darkMode ? "/sales-os-dark.svg" : "/sales-os-light.svg"}
					alt="Sales OS"
					className="my-0 inline-block h-7"
				></img>{" "}
				platforms, <br /> to leverage zoominfo's best in class contact and buying signal data
				to provide customers with an end-to-end pipeline that can, source and hire a candidate
				or convert buyer research into actionable sales prospects!{" "}
			</p>
			<p>Stack: AngularJS, NestJS, Groovy on Grails, Apache Solr, Jenkins, Google Cloud </p>
			<h2>
				Ex - Technical Lead @{" "}
				<a rel="noopener" target="_blank" href="https://staging.ezcaza.com/">
					Ezcaza
				</a>{" "}
			</h2>
			<p>
				Bringing real estate to the 21st century, <br /> our vision is to change how real
				estate tranasctions are managed by title companies and real estate vendors.
			</p>
			<p>Stack: NextJS, Express.js, MySQL, Github Actions, Vercel </p>
		</div>
	);
}
