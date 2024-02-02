import { Link } from "@remix-run/react";
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

export default function mlExp() {
	return (
		<div className="animate-fade-in-fast">
			<h1>Hey! here are some of my ML experiments</h1>
			<h2>Basic Movie Recommender 🚧(WIP)</h2>
			<p className="lead">stack: MLflow, Tensorflow, Spark, AWS Sage maker</p>
			<p>Movie watched: Bad Boys (1995)</p>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				strokeWidth={1.5}
				stroke="currentColor"
				className="h-6 w-6"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"
				/>
			</svg>

			<p>Recommendations: </p>
			<p>
				Headless Body in Topless Bar (1995)
				<br />
				Last Summer in the Hamptons (1995)
				<br />
				Two Bits (1995)
				<br />
				Shadows (Cienie) (1988)
			</p>
			<p>
				Looks pretty simple 👀, but there is a lot going on the Backend to compute the results!
				We have a recommendations model that pulls data from the{" "}
				<Link to="https://www.kaggle.com/datasets/grouplens/movielens-20m-dataset">
					Movie Lens
				</Link>{" "}
				dataset to compute results based on movies a user likes.
			</p>
			<p>
				Leveraging <Link to="https://mlflow.org//">MLflow</Link> we created a end to end
				production ready pipeline to train, test, deploy and track ML models at scale.
			</p>
		</div>
	);
}
