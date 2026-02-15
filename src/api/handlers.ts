import { getAnalysisStatus } from "../analysis/service";
import { config } from "../config";
import type { JobController } from "../scheduler/jobs";

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

export const createApiHandler =
  (jobController: JobController) =>
  (req: Request): Promise<Response> | Response => {
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

      const result = jobController.triggerScrape("manual");
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

      const result = jobController.triggerAnalysis("manual");
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
        .then((status) => {
          const state = jobController.getRuntimeState();

          return Response.json({
            running: state.isAnalysisRunning,
            runningSince: state.analysisStartedAtIso,
            ...status,
          });
        })
        .catch((error) => {
          console.error("Failed to fetch analysis status", error);
          return new Response("Failed to fetch analysis status", { status: 500 });
        });
    }

    return new Response("Naver News Scraper", { status: 200 });
  };
