import * as cron from "node-cron";
import { config } from "./src/config";
import { getAnalysisStatus, runAnalysisAndSummary } from "./src/services/analysisService";
import { scrapeAndUpload } from "./src/services/scrapeService";

let isScrapeRunning = false;
let scrapeStartedAtIso: string | null = null;
let isAnalysisRunning = false;
let analysisStartedAtIso: string | null = null;

type ScrapeSource = "manual" | "cron";
type AnalysisSource = "manual" | "cron";

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

const runAnalysisJob = async (source: AnalysisSource, startedAtMs: number): Promise<void> => {
  try {
    const result = await runAnalysisAndSummary();
    const durationMs = Date.now() - startedAtMs;
    console.log(
      `[${new Date().toISOString()}] Analysis completed (source=${source}, durationMs=${durationMs}, processed=${result.analysis.processed}, succeeded=${result.analysis.succeeded}, failed=${result.analysis.failed})`,
    );
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    console.error(`[${new Date().toISOString()}] Analysis failed (source=${source}, durationMs=${durationMs})`, error);
  } finally {
    const finishedAt = new Date().toISOString();
    isAnalysisRunning = false;
    analysisStartedAtIso = null;
    console.log(`[${finishedAt}] Analysis lock released (source=${source})`);
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

const startAnalysisWithLock = (
  source: AnalysisSource,
):
  | { started: true }
  | {
      started: false;
      reason: "already_running";
      runningSince: string | null;
    } => {
  if (isAnalysisRunning) {
    return {
      started: false,
      reason: "already_running",
      runningSince: analysisStartedAtIso,
    };
  }

  isAnalysisRunning = true;
  const startedAtMs = Date.now();
  analysisStartedAtIso = new Date(startedAtMs).toISOString();

  console.log(`[${analysisStartedAtIso}] Analysis lock acquired (source=${source})`);

  void runAnalysisJob(source, startedAtMs);

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
  port: config.port,
  fetch(req) {
    const url = new URL(req.url);
    const scrapeTriggerToken = config.scrapeToken;
    const analysisTriggerToken = config.analysisToken;

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

      if (!scrapeTriggerToken) {
        console.error("SCRAPE_TRIGGER_TOKEN is not configured");
        return new Response("Trigger token is not configured", { status: 503 });
      }

      const providedToken = getBearerToken(req.headers.get("authorization"));
      if (!providedToken) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Bearer realm="trigger-scrape"' },
        });
      }

      if (providedToken !== scrapeTriggerToken) {
        return new Response("Forbidden", { status: 403 });
      }

      const result = startScrapeWithLock("manual");
      if (!result.started) {
        console.warn(`Manual trigger rejected: scrape already running since ${result.runningSince ?? "unknown"}`);
        return new Response("Scrape is already running", { status: 409 });
      }

      return new Response("Scraping job triggered", { status: 202 });
    }

    if (url.pathname === "/trigger-analysis") {
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }

      if (!analysisTriggerToken) {
        console.error("ANALYSIS_TRIGGER_TOKEN is not configured");
        return new Response("Analysis trigger token is not configured", { status: 503 });
      }

      const providedToken = getBearerToken(req.headers.get("authorization"));
      if (!providedToken) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Bearer realm="trigger-analysis"' },
        });
      }

      if (providedToken !== analysisTriggerToken) {
        return new Response("Forbidden", { status: 403 });
      }

      const result = startAnalysisWithLock("manual");
      if (!result.started) {
        console.warn(`Manual analysis trigger rejected: already running since ${result.runningSince ?? "unknown"}`);
        return new Response("Analysis is already running", { status: 409 });
      }

      return new Response("Analysis job triggered", { status: 202 });
    }

    if (url.pathname === "/analysis/status") {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET" },
        });
      }

      return getAnalysisStatus()
        .then((status) =>
          Response.json({
            running: isAnalysisRunning,
            runningSince: analysisStartedAtIso,
            ...status,
          }),
        )
        .catch((error) => {
          console.error("Failed to fetch analysis status", error);
          return new Response("Failed to fetch analysis status", { status: 500 });
        });
    }

    return new Response("Naver News Scraper", { status: 200 });
  },
});

// Schedule scraping job - runs daily at 9:00 AM KST
cron.schedule(
  config.scrapeSchedule,
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

// Schedule analysis job - runs daily at 10:00 AM KST
cron.schedule(
  config.analysisSchedule,
  async () => {
    const result = startAnalysisWithLock("cron");
    if (!result.started) {
      console.warn(`Scheduled analysis skipped: already running since ${result.runningSince ?? "unknown"}`);
    }
  },
  {
    timezone: "Asia/Seoul",
  },
);

console.log(`Server running on port ${config.port}. Cron job scheduled.`);
