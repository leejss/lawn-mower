import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	OUTPUT_BATCH_JSON_FILE,
	OUTPUT_BATCH_TXT_FILE,
	OUTPUT_DIR,
	OUTPUT_FAILURE_JSON_FILE,
	OUTPUT_JSON_FILE,
	OUTPUT_TXT_FILE,
} from "../config/constants";
import type { Article } from "../core/article";
import type { ScrapeFailure } from "../core/failure";

export const formatArticleText = (article: Article): string =>
	[
		`URL: ${article.url}`,
		`제목: ${article.title || "(제목을 찾지 못했습니다)"}`,
		`작성일: ${article.publishedAt || "(작성일을 찾지 못했습니다)"}`,
		"",
		"본문:",
		article.body || "(본문을 찾지 못했습니다)",
	].join("\n");

export const writeOutputs = async (
	article: Article,
): Promise<{ txtPath: string; jsonPath: string }> => {
	await mkdir(OUTPUT_DIR, { recursive: true });

	const text = formatArticleText(article);
	const txtPath = join(OUTPUT_DIR, OUTPUT_TXT_FILE);
	const jsonPath = join(OUTPUT_DIR, OUTPUT_JSON_FILE);

	await Promise.all([
		writeFile(txtPath, text, "utf-8"),
		writeFile(jsonPath, `${JSON.stringify(article, null, 2)}\n`, "utf-8"),
	]);

	return { txtPath, jsonPath };
};

export const writeBatchOutputs = async (
	articles: readonly Article[],
	failures: readonly ScrapeFailure[],
): Promise<{ txtPath: string; jsonPath: string; failurePath: string }> => {
	await mkdir(OUTPUT_DIR, { recursive: true });

	const txtPath = join(OUTPUT_DIR, OUTPUT_BATCH_TXT_FILE);
	const jsonPath = join(OUTPUT_DIR, OUTPUT_BATCH_JSON_FILE);
	const failurePath = join(OUTPUT_DIR, OUTPUT_FAILURE_JSON_FILE);

	const text = articles
		.map((article, index) =>
			[`[${index + 1}]`, formatArticleText(article)].join("\n"),
		)
		.join("\n\n");

	await Promise.all([
		writeFile(txtPath, text, "utf-8"),
		writeFile(jsonPath, `${JSON.stringify(articles, null, 2)}\n`, "utf-8"),
		writeFile(failurePath, `${JSON.stringify(failures, null, 2)}\n`, "utf-8"),
	]);

	return { txtPath, jsonPath, failurePath };
};
