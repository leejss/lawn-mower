import { config } from "../config";
import { saveArticlesToSupabase } from "../db/supabase";
import { collectMainnewsArticleUrls } from "./collector";
import { scrapeNaverNewsBatch } from "./scraper";

export async function scrapeAndUpload(): Promise<void> {
  console.log("Starting scraping process...");

  const urls = await collectMainnewsArticleUrls(1, config.mainnewsLimit);

  if (urls.length === 0) {
    console.log("No URLs found on mainnews page");
    return;
  }

  console.log(`Found ${urls.length} URLs to scrape`);

  const { articles, failures } = await scrapeNaverNewsBatch(urls, config.concurrency);

  console.log(`Scraped ${articles.length} articles successfully`);

  if (failures.length > 0) {
    console.warn(`Failed to scrape ${failures.length} URLs:`, failures);
  }

  if (articles.length === 0) {
    console.log("No articles to upload");
    return;
  }

  await saveArticlesToSupabase(articles);

  console.log(`Successfully uploaded ${articles.length} articles to Supabase`);
}
