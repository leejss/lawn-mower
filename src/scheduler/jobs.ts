import * as cron from "node-cron";
import { processDailySummary, processNewsAnalysis } from "../analysis/service";
import { config } from "../config";
import { scrapeAndUpload } from "../scrape/service";

type ScrapeSource = "manual" | "cron";
type AnalysisSource = "manual" | "cron";

export type TriggerResult =
  | { started: true }
  | {
      started: false;
      reason: "already_running";
      runningSince: string | null;
    };

export const createJobController = () => {
  let isScrapeRunning = false;
  let scrapeStartedAtIso: string | null = null;
  let isAnalysisRunning = false;
  let analysisStartedAtIso: string | null = null;

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
      const analysis = await processNewsAnalysis();
      const summary = await processDailySummary();
      const durationMs = Date.now() - startedAtMs;
      console.log(
        `[${new Date().toISOString()}] Analysis completed (source=${source}, durationMs=${durationMs}, processed=${analysis.processed}, succeeded=${analysis.succeeded}, failed=${analysis.failed}, summaryDate=${summary.summaryDate}, analyzedCount=${summary.analyzedCount})`,
      );
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      console.error(
        `[${new Date().toISOString()}] Analysis failed (source=${source}, durationMs=${durationMs})`,
        error,
      );
    } finally {
      const finishedAt = new Date().toISOString();
      isAnalysisRunning = false;
      analysisStartedAtIso = null;
      console.log(`[${finishedAt}] Analysis lock released (source=${source})`);
    }
  };

  const triggerScrape = (source: ScrapeSource): TriggerResult => {
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

    runScrapeJob(source, startedAtMs);

    return { started: true };
  };

  const triggerAnalysis = (source: AnalysisSource): TriggerResult => {
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

    runAnalysisJob(source, startedAtMs);

    return { started: true };
  };

  return {
    triggerScrape,
    triggerAnalysis,
    getRuntimeState: () => ({
      isScrapeRunning,
      scrapeStartedAtIso,
      isAnalysisRunning,
      analysisStartedAtIso,
    }),
  };
};

export type JobController = ReturnType<typeof createJobController>;

export const registerSchedules = (jobController: JobController): void => {
  cron.schedule(
    config.scrapeSchedule,
    async () => {
      const result = jobController.triggerScrape("cron");
      if (!result.started) {
        console.warn(`Scheduled scrape skipped: already running since ${result.runningSince ?? "unknown"}`);
      }
    },
    {
      timezone: "Asia/Seoul",
    },
  );

  cron.schedule(
    config.analysisSchedule,
    async () => {
      const result = jobController.triggerAnalysis("cron");
      if (!result.started) {
        console.warn(`Scheduled analysis skipped: already running since ${result.runningSince ?? "unknown"}`);
      }
    },
    {
      timezone: "Asia/Seoul",
    },
  );
};
