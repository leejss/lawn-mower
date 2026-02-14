import * as cron from "node-cron";
import { scrapeAndUpload } from "./src/services/scrapeService";

const TRIGGER_TOKEN_ENV_KEY = "SCRAPE_TRIGGER_TOKEN";

const getBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
};

// Health check endpoint (for Railway & Supabase keep-alive)
Bun.serve({
  port: process.env.PORT || 3000,
  fetch(req) {
    const url = new URL(req.url);
    const triggerToken = process.env[TRIGGER_TOKEN_ENV_KEY];

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    if (url.pathname === "/trigger-scrape") {
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }

      if (!triggerToken) {
        console.error(`${TRIGGER_TOKEN_ENV_KEY} is not configured`);
        return new Response("Trigger token is not configured", { status: 503 });
      }

      const providedToken = getBearerToken(req.headers.get("authorization"));
      if (!providedToken) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Bearer realm="trigger-scrape"' },
        });
      }

      if (providedToken !== triggerToken) {
        return new Response("Forbidden", { status: 403 });
      }

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
      console.log(`[${new Date().toISOString()}] Scheduled scraping job completed`);
    } catch (error) {
      console.error("Scheduled scraping job failed:", error);
    }
  },
  {
    timezone: "Asia/Seoul",
  },
);

console.log(`Server running on port ${process.env.PORT || 3000}. Cron job scheduled.`);
