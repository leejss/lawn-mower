import { readFile } from "node:fs/promises";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Article } from "../core/article";
import { toNewsId } from "../core/newsId";
import type { RawNewsRecord } from "../core/rawNewsRecord";

const parseArg = (argv: string[], key: string): string | undefined => {
  const index = argv.indexOf(key);
  return index === -1 ? undefined : argv[index + 1];
};

const getIsoNow = (): string => new Date().toISOString();

const loadArticles = async (filePath: string): Promise<Article[]> => {
  const content = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as Article[];
  }

  return [parsed as Article];
};

const toRawNewsRecord = (article: Article, source: RawNewsRecord["source"], nowIso: string): RawNewsRecord => ({
  news_id: toNewsId(article.url),
  url: article.url,
  title: article.title,
  body: article.body,
  published_at: article.publishedAt,
  collected_at: nowIso,
  source,
  status: "PENDING",
  version: 1,
  last_seen_at: nowIso,
});

const upsertRawNews = async (
  docClient: DynamoDBDocumentClient,
  tableName: string,
  record: RawNewsRecord,
): Promise<void> => {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { news_id: record.news_id },
      UpdateExpression: [
        "SET #url = :url",
        "#title = :title",
        "#body = :body",
        "#published_at = :published_at",
        "#collected_at = :collected_at",
        "#last_seen_at = :last_seen_at",
        "#source = :source",
        "#status = if_not_exists(#status, :status)",
        "#version = if_not_exists(#version, :zero) + :one",
      ].join(", "),
      ExpressionAttributeNames: {
        "#url": "url",
        "#title": "title",
        "#body": "body",
        "#published_at": "published_at",
        "#collected_at": "collected_at",
        "#last_seen_at": "last_seen_at",
        "#source": "source",
        "#status": "status",
        "#version": "version",
      },
      ExpressionAttributeValues: {
        ":url": record.url,
        ":title": record.title,
        ":body": record.body,
        ":published_at": record.published_at,
        ":collected_at": record.collected_at,
        ":last_seen_at": record.last_seen_at,
        ":source": record.source,
        ":status": record.status,
        ":zero": 0,
        ":one": 1,
      },
    }),
  );
};

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const tableName = parseArg(argv, "--table") ?? process.env.RAW_NEWS_TABLE;
  const filePath = parseArg(argv, "--file") ?? "out/articles.json";
  const source = (parseArg(argv, "--source") as RawNewsRecord["source"] | undefined) ?? "naver_finance_mainnews";

  if (!tableName) {
    throw new Error("RAW_NEWS_TABLE 환경변수 또는 --table 인자가 필요합니다.");
  }

  const articles = await loadArticles(filePath);
  if (articles.length === 0) {
    console.log("업로드할 기사 데이터가 없습니다.");
    return;
  }

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const nowIso = getIsoNow();
  for (const article of articles) {
    const record = toRawNewsRecord(article, source, nowIso);
    await upsertRawNews(docClient, tableName, record);
  }

  console.log(`DynamoDB 업로드 완료: ${articles.length}건 (table=${tableName})`);
};

main().catch((error) => {
  console.error("DynamoDB 업로드 실패:", error);
  process.exit(1);
});
