import { Link } from "react-router";

export default function projects() {
	return (
		<div className="animate-fade-in-fast">
			<h2>Derivatives Based Quantitative Trading Strategy</h2>
			<p>
				Designed and backtested a proprietary, low-latency computational strategy for a weighted confidence model in C++ that 
				synthesizes signals to generate high-conviction trading decisions using historical data from the <Link to="https://alpaca.markets/options">Alpaca API</Link>. <br/>
				The model achieved a backtested cumulative 2024 yearly return of 54.8% on $25K initial capital.

			</p>
			<p>
				he model is deployed on a event-driven trading infrastructure on AWS, leveraging EventBridge to schedule Lambda functions that manage the lifecycle of a C++-optimized EC2 trading instance, minimizing operational costs.
			</p>
			<p className="lead">stack: C++, Alpaca SDK, TA-lib, AWS </p>
			<h2>
				<Link to="https://nextjs-chat-mu-opal.vercel.app/">Custom LLM Chatbot</Link>
			</h2>

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
			<p className="lead">stack: NextJS, Langchain, Vercel AI SDK, Prompt Engineering</p>
		</div>
	);
}
