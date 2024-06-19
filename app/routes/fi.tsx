import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/solid";
import { Button, Flex, Select, Table, TextField, Theme } from "@radix-ui/themes";
import { MouseEventHandler, useEffect, useState } from "react";

export interface Sentiments {
	[key: string]: Array<string>;
}
const quotes: Array<string> = [
	"PLTR",
	"MSFT",
	"NFLX",
	"AAPL",
	"TSLA",
	"META",
	"NVD",
	"AMZN",
	"GOOGL",
];
export default function projects() {
	const [sentimentStorage, setSentimentStorage] = useState<Sentiments>({});
	const [sentiment, setSentiment] = useState<Array<string>>(quotes.map(() => "up"));
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");

	useEffect(() => {
		setSentimentStorage(
			JSON.parse(window.localStorage.getItem("PortfolioSentiments") ?? "{}") as Sentiments
		);
	}, []);
	const deleteSentiment = (FromTo: string) => {
		const updatedSentiments: Sentiments = { ...sentimentStorage };
		delete updatedSentiments[FromTo];

		// Update local state
		setSentimentStorage(updatedSentiments);

		// Optionally, persist to localStorage
		localStorage.setItem("PortfolioSentiments", JSON.stringify(updatedSentiments));
	};
	const printSentiments = () => {
		return Object.entries(sentimentStorage).map(([FromTo, sentiments], index) => {
			const [From, To] = FromTo.split(":");

			return (
				<Table.Row key={index}>
					<Table.Cell>{From}</Table.Cell>
					{sentiments.map((value, index) => (
						<Table.Cell>
							{value === "up" ? <ArrowUpIcon color="green" /> : <ArrowDownIcon color="red" />}
						</Table.Cell>
					))}
					<Table.Cell>{To}</Table.Cell>
					<Table.Cell>
						<Button
							onClick={(event) => {
								event.stopPropagation();
								deleteSentiment(FromTo);
							}}
						>
							Delete Row
						</Button>
					</Table.Cell>
				</Table.Row>
			);
		});
	};
	const updateSentiments = () => {
		// Assuming you want to update the sentiment for a specific stock
		// This example updates all sentiments to "up" for demonstration purposes
		const updatedSentiments: Sentiments = {
			...sentimentStorage,
			[`${from}:${to}`]: sentiment,
		};

		// Update local state
		setSentimentStorage(updatedSentiments);

		// Optionally, persist to localStorage
		localStorage.setItem("PortfolioSentiments", JSON.stringify(updatedSentiments));
	};
	return (
		<Theme panelBackground="solid" hasBackground={false} radius="medium">
			<div className="relative right-28 animate-fade-in-fast">
				<h2>Stock Sentiment Tracker </h2>
				<Table.Root variant="surface" className="w-max">
					<Table.Header>
						<Table.Row>
							<Table.ColumnHeaderCell>From</Table.ColumnHeaderCell>
							{quotes.map((q) => (
								<Table.ColumnHeaderCell>{q}</Table.ColumnHeaderCell>
							))}
							<Table.ColumnHeaderCell>To</Table.ColumnHeaderCell>
							<Table.ColumnHeaderCell></Table.ColumnHeaderCell>
						</Table.Row>
					</Table.Header>

					<Table.Body>
						{printSentiments()}
						<Table.Row>
							<Table.Cell>
								<TextField.Root
									placeholder="From"
									className="w-12 rounded-md p-0.5 text-black"
									onChange={(e) => setFrom(e.currentTarget.value)}
								/>
							</Table.Cell>
							{quotes.map((_, index) => (
								<Table.Cell>
									<Select.Root
										defaultValue="up"
										onValueChange={(value) =>
											setSentiment((sentiment) => {
												sentiment[index] = value;
												return sentiment;
											})
										}
									>
										<Select.Trigger />
										<Select.Content>
											<Select.Item value="up">
												<Flex>
													<ArrowUpIcon width={16} />
												</Flex>
											</Select.Item>
											<Select.Item value="down">
												<Flex>
													<ArrowDownIcon width={16} />
												</Flex>
											</Select.Item>
										</Select.Content>
									</Select.Root>
								</Table.Cell>
							))}

							<Table.Cell>
								<TextField.Root
									placeholder="To"
									className="w-12 rounded-md p-0.5 text-black"
									onChange={(e) => setTo(e.currentTarget.value)}
								/>
							</Table.Cell>
						</Table.Row>
					</Table.Body>
				</Table.Root>
				<Button
					style={{ marginTop: "12px" }}
					onClick={(event) => {
						event.stopPropagation();
						updateSentiments();
					}}
				>
					+ Add Row
				</Button>
			</div>
		</Theme>
	);
}
