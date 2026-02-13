export default function myWork({ darkMode }: { darkMode: boolean }) {
	return (
		<div className="animate-fade-in-fast">
			{/* <h2>
				Founder @{" "}
				<a rel="noopener" target="_blank" href="https://www.elefcap.com">
					Eleftheria Capital
				</a>{" "}
			</h2>
			<p>
				Architecting a quantitative trading firm focused on end-to-end alpha research,
				quantitative verification, and trade management. The name{" "}
				<span className="italic">Eleftheria</span> embodies{" "}
				<span className="font-medium">freedom</span>—ideals we pursue by mastering market
				complexity.
			</p>
			<p>
				Our edge lies at the intersection of mathematical rigor and technological innovation,
				turning chaos into opportunity through disciplined, data-driven execution to push the
				boundaries of what is computationally possible.
			</p>
			<p className="lead">
				Stack: C++, Python, Compiler Optimizations, FIX Protocol, Terraform, AWS
			</p> */}

			<h2>
				Machine learning Graduate Engineer @{" "}
				<a rel="noopener" target="_blank" href="https://ora.umd.edu/">
					U of M Division of Research
				</a>{" "}
			</h2>
			<p>
				Engineered collaboratively with various Departments at the University of Maryland,
				Built a robust and automated langchain pipeline to process research data via an
				ensemble of Amazon Nova Premier and Nova Lite models to ensure federal compliance of
				research proposals.
			</p>
			<p className="lead">
				Stack: Streamlit, Python, MySQL, Langchain, AWS Bedrock, Hugging Face, AWS
			</p>

			<h2>
				Ex - Gradute Software Engineering Lead @{" "}
				<a
					rel="noopener"
					target="_blank"
					href="https://extension.umd.edu/programs/agriculture-food-systems/program-areas/farm-and-agribusiness-management/grain-marketing/crop-budgets/"
				>
					U of M Extension
				</a>{" "}
			</h2>
			<p>
				Spearheaded the development of a dynamic Grain budgeting and data assessment tool,
				leveraging a comprehensive database to provide farmers with real-time insights into
				their crop budgets and financial planning.
			</p>
			<p className="lead">Stack: NextJS, Radix UI, AWS Amplify, DynamoDB, AWS </p>

			<h2>
				Ex - Software Engineer @{" "}
				<a rel="noopener" target="_blank" href="https://www.zoominfo.com/">
					Zoominfo
				</a>{" "}
			</h2>
			<p>
				Worked on the{" "}
				<img
					src={darkMode ? "/talent-os-dark.svg" : "/talent-os-light.svg"}
					alt="Talent OS"
					className="m-0! inline-block h-7"
				></img>{" "}
				and{" "}
				<img
					src={darkMode ? "/sales-os-dark.svg" : "/sales-os-light.svg"}
					alt="Sales OS"
					className="m-0! inline-block h-7"
				></img>{" "}
				platforms, <br /> to leverage zoominfo's best in class contact and buying signal data
				to provide customers with an end-to-end pipeline that can, source and hire a candidate
				or convert buyer research into actionable sales prospects!{" "}
			</p>
			<p className="lead">
				Stack: AngularJS, NestJS, Groovy on Grails, Apache Solr, Jenkins, Google Cloud{" "}
			</p>
			<h2>
				Ex - Technical Lead @{" "}
				<a rel="noopener" target="_blank" href="https://ezcaza.com/">
					Ezcaza
				</a>{" "}
			</h2>
			<p>
				Bringing real estate to the 21st century, <br /> our vision is to change how real
				estate tranasctions are managed by title companies and real estate vendors.
			</p>
			<p className="lead">Stack: NextJS, Express.js, MySQL, Github Actions, Vercel </p>
		</div>
	);
}
