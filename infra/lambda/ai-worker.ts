import { type AttributeValue, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	DynamoDBDocumentClient,
	PutCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";

type RawNewsItem = {
	news_id: string;
	title: string;
	body: string;
	url: string;
	published_at: string;
	status?: string;
};

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ANALYSIS_TABLE_NAME = process.env.ANALYSIS_TABLE_NAME;
const RAW_NEWS_TABLE_NAME = process.env.RAW_NEWS_TABLE_NAME;

const assertEnv = (): void => {
	if (!ANALYSIS_TABLE_NAME || !RAW_NEWS_TABLE_NAME) {
		throw new Error(
			"ANALYSIS_TABLE_NAME 또는 RAW_NEWS_TABLE_NAME 환경변수가 없습니다.",
		);
	}
};

const toRawNewsItem = (record: DynamoDBRecord): RawNewsItem | null => {
  const image = record.dynamodb?.NewImage;
  if (!image) {
    return null;
  }

  const item = unmarshall(
    image as unknown as Record<string, AttributeValue>,
  ) as RawNewsItem;
	if (!item.news_id || !item.title || !item.body) {
		return null;
	}

	return item;
};

const summarize = (body: string): string => {
	const sentences = body
		.split(/(?<=[.!?。！？])\s+|\n+/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	return sentences.slice(0, 3).join(" ").slice(0, 1000);
};

const extractKeywords = (title: string, body: string): string[] => {
	const stopwords = new Set([
		"그리고",
		"하지만",
		"대한",
		"있는",
		"한다",
		"했다",
		"으로",
		"에서",
		"하는",
	]);

	const words = `${title} ${body}`
		.toLowerCase()
		.replace(/[^a-z0-9가-힣\s]/g, " ")
		.split(/\s+/)
		.filter((word) => word.length >= 2)
		.filter((word) => !stopwords.has(word));

	const counts = new Map<string, number>();
	for (const word of words) {
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([word]) => word);
};

const classifySentiment = (
	body: string,
): "POSITIVE" | "NEGATIVE" | "NEUTRAL" => {
	const positiveTokens = ["상승", "호황", "개선", "성장", "호실적", "강세"];
	const negativeTokens = ["하락", "악화", "감소", "부진", "약세", "손실"];

	let score = 0;
	for (const token of positiveTokens) {
		if (body.includes(token)) {
			score += 1;
		}
	}

	for (const token of negativeTokens) {
		if (body.includes(token)) {
			score -= 1;
		}
	}

	if (score > 0) {
		return "POSITIVE";
	}

	if (score < 0) {
		return "NEGATIVE";
	}

	return "NEUTRAL";
};

const saveAnalysis = async (item: RawNewsItem): Promise<void> => {
	const now = new Date().toISOString();
	const summary = summarize(item.body);
	const keywords = extractKeywords(item.title, item.body);
	const sentiment = classifySentiment(item.body);

	await ddbClient.send(
		new PutCommand({
			TableName: ANALYSIS_TABLE_NAME,
			Item: {
				news_id: item.news_id,
				url: item.url,
				title: item.title,
				published_at: item.published_at,
				summary,
				keywords,
				sentiment,
				model: "heuristic-v1",
				analyzed_at: now,
				status: "DONE",
			},
		}),
	);

	await ddbClient.send(
		new UpdateCommand({
			TableName: RAW_NEWS_TABLE_NAME,
			Key: { news_id: item.news_id },
			UpdateExpression: "SET #status = :status, #processed_at = :processed_at",
			ExpressionAttributeNames: {
				"#status": "status",
				"#processed_at": "processed_at",
			},
			ExpressionAttributeValues: {
				":status": "DONE",
				":processed_at": now,
			},
		}),
	);
};

const markFailure = async (
	item: RawNewsItem,
	errorMessage: string,
): Promise<void> => {
	await ddbClient.send(
		new UpdateCommand({
			TableName: RAW_NEWS_TABLE_NAME,
			Key: { news_id: item.news_id },
			UpdateExpression: "SET #status = :status, #error = :error",
			ExpressionAttributeNames: {
				"#status": "status",
				"#error": "error",
			},
			ExpressionAttributeValues: {
				":status": "FAILED",
				":error": errorMessage,
			},
		}),
	);
};

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
	assertEnv();

	for (const record of event.Records) {
		if (record.eventName !== "INSERT" && record.eventName !== "MODIFY") {
			continue;
		}

		const item = toRawNewsItem(record);
		if (!item) {
			continue;
		}

		if (item.status === "DONE") {
			continue;
		}

		try {
			await ddbClient.send(
				new UpdateCommand({
					TableName: RAW_NEWS_TABLE_NAME,
					Key: { news_id: item.news_id },
					UpdateExpression: "SET #status = :status",
					ExpressionAttributeNames: { "#status": "status" },
					ExpressionAttributeValues: { ":status": "PROCESSING" },
				}),
			);

			await saveAnalysis(item);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await markFailure(item, message);
			throw error;
		}
	}
};
