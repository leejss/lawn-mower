import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { config } from "../config";
import type { MarketDailySummary, NewsAnalysisResult } from "../core/analysis";
import {
  fetchNewsAnalysesByDate,
  fetchPendingRawNews,
  getRawNewsStatusCounts,
  saveMarketDailySummary,
  saveNewsAnalysis,
  tryMarkRawNewsAsProcessing,
  updateRawNewsStatus,
} from "../db/supabase";

const KST_TIME_ZONE = "Asia/Seoul";

const ensureAnalysisEnv = (): void => {
  if (!config.openaiKey) {
    throw new Error("OPENAI_API_KEY is required to run analysis");
  }
};

const analysisSchema = z.object({
  sentimentLabel: z.enum(["bullish", "neutral", "bearish"]),
  sentimentScore: z.number().min(-1).max(1),
  sectors: z.array(z.string().min(1)).max(8),
  keywords: z
    .array(
      z.object({
        keyword: z.string().min(1),
        score: z.number().min(0).max(1),
        reason: z.string().min(1),
      }),
    )
    .min(3)
    .max(10),
  capitalFlowSignal: z.object({
    direction: z.enum(["inflow", "outflow", "neutral"]),
    participants: z
      .array(z.enum(["foreign", "institutional", "retail"]))
      .min(1)
      .max(3),
    rationale: z.string().min(1),
  }),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  nextKeywords: z
    .array(
      z.object({
        keyword: z.string().min(1),
        reason: z.string().min(1),
        confidence: z.number().min(0).max(1),
        followMetrics: z.array(z.string().min(1)).min(1).max(4),
      }),
    )
    .min(3)
    .max(5),
});

const dailySummarySchema = z.object({
  summaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marketRegime: z.enum(["risk_on", "neutral", "risk_off"]),
  highlights: z.array(z.string().min(1)).min(3).max(5),
  topSectors: z.array(z.string().min(1)).min(1).max(5),
  topKeywords: z.array(z.string().min(1)).min(3).max(8),
  nextKeywords: z
    .array(
      z.object({
        keyword: z.string().min(1),
        reason: z.string().min(1),
        confidence: z.number().min(0).max(1),
        followMetrics: z.array(z.string().min(1)).min(1).max(4),
      }),
    )
    .min(3)
    .max(5),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
});

const getKstDateString = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const analyzeArticle = async (article: {
  title: string;
  body: string;
  publishedAt: string;
}): Promise<NewsAnalysisResult> => {
  const { output } = await generateText({
    model: openai(config.aiModel),
    output: Output.object({ schema: analysisSchema }),
    system:
      "You are a Korean financial news analyst. Return only evidence-based structured JSON. This is not investment advice.",
    prompt: [
      `title: ${article.title}`,
      `published_at: ${article.publishedAt}`,
      "body:",
      article.body,
      "\nExtract sentiment, sector trend, text-based capital flow signal, and next keyword ideas.",
    ].join("\n"),
  });

  return output;
};

const summarizeDaily = async (summaryDate: string, analyses: NewsAnalysisResult[]): Promise<MarketDailySummary> => {
  const compactPayload = analyses.map((analysis) => ({
    sentimentLabel: analysis.sentimentLabel,
    sentimentScore: analysis.sentimentScore,
    sectors: analysis.sectors,
    keywords: analysis.keywords.map((item) => item.keyword),
    capitalFlowDirection: analysis.capitalFlowSignal.direction,
    nextKeywords: analysis.nextKeywords.map((item) => item.keyword),
  }));

  const { output } = await generateText({
    model: openai(config.aiModel),
    output: Output.object({ schema: dailySummarySchema }),
    system: "You aggregate Korean stock market news analysis into a concise daily market summary. Return JSON only.",
    prompt: [
      `summary_date: ${summaryDate}`,
      "analysis_items:",
      JSON.stringify(compactPayload),
      "\nGenerate market regime, top sectors/keywords, and next keyword suggestions.",
    ].join("\n"),
  });

  return output;
};

export async function runNewsAnalysisBatch(limit = config.analysisBatchSize): Promise<{
  picked: number;
  processed: number;
  succeeded: number;
  failed: number;
}> {
  ensureAnalysisEnv();

  const pendingItems = await fetchPendingRawNews(limit);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const item of pendingItems) {
    const locked = await tryMarkRawNewsAsProcessing(item.news_id);
    if (!locked) {
      continue;
    }

    processed += 1;

    try {
      const analysis = await analyzeArticle({
        title: item.title,
        body: item.body,
        publishedAt: item.published_at,
      });

      await saveNewsAnalysis(item.news_id, analysis);
      await updateRawNewsStatus(item.news_id, "DONE");
      succeeded += 1;
    } catch (error) {
      await updateRawNewsStatus(item.news_id, "FAILED");
      failed += 1;
      console.error(`[analysis] failed news_id=${item.news_id}`, error);
    }
  }

  return {
    picked: pendingItems.length,
    processed,
    succeeded,
    failed,
  };
}

export async function buildAndSaveDailySummary(targetDate = getKstDateString(new Date())): Promise<{
  summaryDate: string;
  analyzedCount: number;
}> {
  const analysisRows = await fetchNewsAnalysesByDate(targetDate);
  const parsed: NewsAnalysisResult[] = [];

  for (const row of analysisRows) {
    const result = analysisSchema.safeParse(row.analysis_result);
    if (result.success) {
      parsed.push(result.data);
    }
  }

  if (parsed.length === 0) {
    await saveMarketDailySummary(targetDate, {
      summaryDate: targetDate,
      marketRegime: "neutral",
      highlights: ["No analyzed news available for this date."],
      topSectors: [],
      topKeywords: [],
      nextKeywords: [],
      confidence: 0,
      summary: "No analyzed news available.",
    });

    return { summaryDate: targetDate, analyzedCount: 0 };
  }

  const summary = await summarizeDaily(targetDate, parsed);
  await saveMarketDailySummary(targetDate, summary);

  return { summaryDate: targetDate, analyzedCount: parsed.length };
}

export async function runAnalysisAndSummary(limit = config.analysisBatchSize): Promise<{
  analysis: { picked: number; processed: number; succeeded: number; failed: number };
  summary: { summaryDate: string; analyzedCount: number };
}> {
  const analysis = await runNewsAnalysisBatch(limit);
  const summary = await buildAndSaveDailySummary();

  return { analysis, summary };
}

export async function getAnalysisStatus(): Promise<{
  statuses: { status: string; count: number }[];
}> {
  const statuses = await getRawNewsStatusCounts();
  return { statuses };
}
