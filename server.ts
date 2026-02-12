import * as cron from "node-cron";
import { scrapeAndUpload } from "./src/services/scrapeService";

// Health check endpoint (for Railway & Supabase keep-alive)
Bun.serve({
	port: process.env.PORT || 3000,
	fetch(req) {
		const url = new URL(req.url);

		if (url.pathname === "/health") {
			return new Response("OK", { status: 200 });
		}

		if (url.pathname === "/trigger-scrape") {
			// Manual trigger endpoint
			scrapeAndUpload()
				.then(() => console.log("Manual scrape triggered"))
				.catch((error) => console.error("Manual scrape failed:", error));
			return new Response("Scraping job triggered", { status: 202 });
		}

		return new Response("Naver News Scraper", { status: 200 });
	},
});

// Schedule scraping job - runs daily at 9:00 AM KST
cron.schedule(
	"0 9 * * *",
	async () => {
		console.log(`[${new Date().toISOString()}] Starting scheduled scraping job`);
		try {
			await scrapeAndUpload();
			console.log(
				`[${new Date().toISOString()}] Scheduled scraping job completed`,
			);
		} catch (error) {
			console.error("Scheduled scraping job failed:", error);
		}
	},
	{
		timezone: "Asia/Seoul",
	},
);

console.log(
	`Server running on port ${process.env.PORT || 3000}. Cron job scheduled.`,
);
