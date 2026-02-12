import { collectMainnewsArticleUrls } from "../scraper/mainnewsCollector";
import { scrapeNaverNewsBatch } from "../scraper/naverNewsScraper";
import { saveArticlesToSupabase } from "../database/supabase";

export async function scrapeAndUpload(): Promise<void> {
	console.log("Starting scraping process...");

	// Collect article URLs from mainnews
	const urls = await collectMainnewsArticleUrls(1, 10);

	if (urls.length === 0) {
		console.log("No URLs found on mainnews page");
		return;
	}

	console.log(`Found ${urls.length} URLs to scrape`);

	// Scrape articles
	const { articles, failures } = await scrapeNaverNewsBatch(urls, 3);

	console.log(`Scraped ${articles.length} articles successfully`);

	if (failures.length > 0) {
		console.warn(`Failed to scrape ${failures.length} URLs:`, failures);
	}

	if (articles.length === 0) {
		console.log("No articles to upload");
		return;
	}

	// Upload to Supabase
	await saveArticlesToSupabase(articles);

	console.log(`Successfully uploaded ${articles.length} articles to Supabase`);
}
