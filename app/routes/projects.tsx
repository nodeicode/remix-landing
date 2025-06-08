import { Link } from "react-router";

export default function projects() {
	return (
		<div className="animate-fade-in-fast">
			<h2>Movie Recommender 🚧(WIP)</h2>
			<p className="lead">stack: MLflow, Tensorflow, Spark, AWS Sage maker</p>
			<p>
				We have a recommendations model that pulls data from the{" "}
				<Link to="https://www.kaggle.com/datasets/grouplens/movielens-20m-dataset">
					Movie Lens
				</Link>{" "}
				dataset to compute results based on movies a user likes.
			</p>
			<p>
				Leveraging <Link to="https://mlflow.org/">MLflow</Link> we created a end to end
				production ready pipeline to train, test, deploy and track ML models at scale.
			</p>
			<h2>
				<Link to="https://nextjs-chat-mu-opal.vercel.app/">Custom LLM Chatbot</Link>
			</h2>
			<p className="lead">stack: NextJS, Langchain, Vercel AI SDK, Prompt Engineering</p>
			<p>
				We use Hugging Face Inference Endpoints to deploy and scale a open source and custom
				LLM model to run inference through a openAI GPT based User interface.
			</p>
			<p>
				Using open Web APIs, Voice input is also enabled based on the{" "}
				<Link to="https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API">
					Web Speech API
				</Link>
				!
			</p>
		</div>
	);
}
