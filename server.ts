import * as cron from "node-cron";
import { scrapeAndUpload } from "./src/services/scrapeService";

const TRIGGER_TOKEN_ENV_KEY = "SCRAPE_TRIGGER_TOKEN";
let isScrapeRunning = false;
let scrapeStartedAtIso: string | null = null;

type ScrapeSource = "manual" | "cron";

const runScrapeJob = async (source: ScrapeSource, startedAtMs: number): Promise<void> => {
  try {
    await scrapeAndUpload();
    const durationMs = Date.now() - startedAtMs;
    console.log(`[${new Date().toISOString()}] Scrape completed (source=${source}, durationMs=${durationMs})`);
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    console.error(`[${new Date().toISOString()}] Scrape failed (source=${source}, durationMs=${durationMs})`, error);
  } finally {
    const finishedAt = new Date().toISOString();
    isScrapeRunning = false;
    scrapeStartedAtIso = null;
    console.log(`[${finishedAt}] Scrape lock released (source=${source})`);
  }
};

const startScrapeWithLock = (
  source: ScrapeSource,
):
  | { started: true }
  | {
      started: false;
      reason: "already_running";
      runningSince: string | null;
    } => {
  if (isScrapeRunning) {
    return {
      started: false,
      reason: "already_running",
      runningSince: scrapeStartedAtIso,
    };
  }

  isScrapeRunning = true;
  const startedAtMs = Date.now();
  scrapeStartedAtIso = new Date(startedAtMs).toISOString();

  console.log(`[${scrapeStartedAtIso}] Scrape lock acquired (source=${source})`);

  void runScrapeJob(source, startedAtMs);

  return { started: true };
};

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

      const result = startScrapeWithLock("manual");
      if (!result.started) {
        console.warn(`Manual trigger rejected: scrape already running since ${result.runningSince ?? "unknown"}`);
        return new Response("Scrape is already running", { status: 409 });
      }

      return new Response("Scraping job triggered", { status: 202 });
    }

    return new Response("Naver News Scraper", { status: 200 });
  },
});

// Schedule scraping job - runs daily at 9:00 AM KST
cron.schedule(
  "0 9 * * *",
  async () => {
    const result = startScrapeWithLock("cron");
    if (!result.started) {
      console.warn(`Scheduled scrape skipped: already running since ${result.runningSince ?? "unknown"}`);
    }
  },
  {
    timezone: "Asia/Seoul",
  },
);

console.log(`Server running on port ${process.env.PORT || 3000}. Cron job scheduled.`);
