import { parseArgs, validateNaverNewsUrl } from "./src/core/url";
import { formatArticleText, writeBatchOutputs, writeOutputs } from "./src/io/output";
import { collectMainnewsArticleUrls } from "./src/scrape/collector";
import { scrapeNaverNews, scrapeNaverNewsBatch } from "./src/scrape/scraper";

const runSingleMode = async (url: string): Promise<void> => {
  const targetUrl = validateNaverNewsUrl(url);
  const article = await scrapeNaverNews(targetUrl);
  console.log(formatArticleText(article));

  const { txtPath, jsonPath } = await writeOutputs(article);
  console.log(`\n저장 완료: ${txtPath}, ${jsonPath}`);
};

const runMainnewsMode = async (page: number, limit: number, concurrency: number): Promise<void> => {
  const urls = await collectMainnewsArticleUrls(page, limit);
  if (urls.length === 0) {
    throw new Error("mainnews 페이지에서 기사 링크를 찾지 못했습니다.");
  }

  console.log(`수집 링크 수: ${urls.length} (page=${page}, limit=${limit})`);
  const { articles, failures } = await scrapeNaverNewsBatch(urls, concurrency);

  const { txtPath, jsonPath, failurePath } = await writeBatchOutputs(articles, failures);
  console.log(`성공: ${articles.length}건, 실패: ${failures.length}건`);
  console.log(`저장 완료: ${txtPath}, ${jsonPath}, ${failurePath}`);
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));

  if (options.mode === "single") {
    await runSingleMode(options.url);
    return;
  }

  await runMainnewsMode(options.page, options.limit, options.concurrency);
};

main().catch((error) => {
  console.error("스크래핑 실패:", error);
  process.exit(1);
});
