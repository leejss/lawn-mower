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

const searchKeywordSchema = z.object({
  keyword: z.string().min(1),
  purpose: z.string().min(10),
  dataSource: z.string().min(1),
});

const analysisSchema = z.object({
  report: z.object({
    headline: z.string().min(10).max(200),
    analysis: z.string().min(100),
    marketImpact: z.string().min(50),
    watchList: z.string().min(30),
    outlook: z.string().min(50),
  }),
  metadata: z.object({
    sentiment: z.enum(["bullish", "neutral", "bearish"]),
    sectors: z.array(z.string().min(1)).max(5),
    confidence: z.number().min(0).max(1),
  }),
  searchKeywords: z.array(searchKeywordSchema).min(2).max(5),
});

const dailySummarySchema = z.object({
  summaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  report: z.object({
    headline: z.string().min(10).max(200),
    marketOverview: z.string().min(100),
    keyDevelopments: z.string().min(100),
    sectorAnalysis: z.string().min(100),
    tomorrowWatch: z.string().min(50),
    analystNote: z.string().min(50),
  }),
  metadata: z.object({
    marketRegime: z.enum(["risk_on", "neutral", "risk_off"]),
    topSectors: z.array(z.string().min(1)).max(5),
    confidence: z.number().min(0).max(1),
  }),
  searchKeywords: z.array(searchKeywordSchema).min(3).max(8),
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
    system: [
      "You are a professional Korean stock market analyst writing a research report.",
      "CRITICAL: Base your analysis ONLY on the provided article content.",
      "You may provide reasonable inferences and professional opinions based on the article.",
      "DO NOT use external market data or information not mentioned in the article.",
      "Clearly distinguish between facts from the article and your analytical inferences.",
      "If the article doesn't provide enough information, state that clearly.",
      "Write in Korean. This is not investment advice.",
    ].join(" "),
    prompt: [
      `title: ${article.title}`,
      `published_at: ${article.publishedAt}`,
      "body:",
      article.body,
      "",
      "=== INSTRUCTIONS ===",
      "Extract and analyze ONLY what is written in the article above.",
      "Do NOT add information from your training data or general knowledge.",
      "",
      "Write an analyst report with:",
      "- report.headline: 1-2 sentence summary capturing the key message",
      "- report.analysis: Detailed analysis of the article's content, implications, and your professional interpretation",
      "- report.marketImpact: Market/sector impact based on the article content and reasonable inferences",
      "- report.watchList: Sectors or stocks to monitor based on the article (if none mentioned, provide reasoned suggestions or state 'insufficient information')",
      "- report.outlook: Forward-looking perspective based on article content and logical inferences",
      "- metadata.sentiment: bullish/neutral/bearish based on article tone",
      "- metadata.sectors: Sectors explicitly mentioned in the article (max 5)",
      "- metadata.confidence: 0-1 (how clear and specific is the article)",
      "- searchKeywords: 2-5 keywords for verifying or expanding on claims made in the article:",
      "  * keyword: specific term or metric mentioned in the article",
      "  * purpose: what aspect of the article this would verify or expand",
      "  * dataSource: where to find this data (e.g., 'KRX 거래량', 'DART 공시', '한국은행 통계', 'Google Trends')",
    ].join("\n"),
  });

  return output;
};

const summarizeDaily = async (summaryDate: string, analyses: NewsAnalysisResult[]): Promise<MarketDailySummary> => {
  const compactPayload = analyses.map((analysis) => ({
    headline: analysis.report.headline,
    sentiment: analysis.metadata.sentiment,
    sectors: analysis.metadata.sectors,
    searchKeywords: analysis.searchKeywords.map((k) => k.keyword),
  }));

  const { output } = await generateText({
    model: openai(config.aiModel),
    output: Output.object({ schema: dailySummarySchema }),
    system: [
      "You are a senior market strategist writing a daily market report in Korean.",
      "CRITICAL: Base your summary on the provided news analyses.",
      "You may provide strategic insights and professional opinions based on the analyses.",
      "DO NOT add external market data not present in the analyses.",
      "Synthesize the analyses and provide your professional interpretation.",
      "Write professionally but accessibly.",
    ].join(" "),
    prompt: [
      `summary_date: ${summaryDate}`,
      `total_news_analyzed: ${analyses.length}`,
      "individual_analyses:",
      JSON.stringify(compactPayload, null, 2),
      "",
      "=== INSTRUCTIONS ===",
      "Synthesize ONLY the information from the analyses above.",
      "Do NOT add market commentary from your training data.",
      "",
      "Write a daily market report with:",
      "- report.headline: One-line summary of the day's market themes",
      "- report.marketOverview: Overall sentiment, themes, and your strategic interpretation",
      "- report.keyDevelopments: Major news and their significance",
      "- report.sectorAnalysis: Sector trends and your professional assessment",
      "- report.tomorrowWatch: What to watch based on today's developments and logical implications",
      "- report.analystNote: Your professional insights, patterns, and strategic perspective on the analyses",
      "- metadata.marketRegime: risk_on/neutral/risk_off based on overall sentiment in analyses",
      "- metadata.topSectors: Top 5 sectors mentioned across analyses",
      "- metadata.confidence: 0-1 (how consistent and clear are the analyses)",
      "- searchKeywords: 3-8 keywords for verifying themes found in the analyses with purpose and dataSource",
    ].join("\n"),
  });

  return output;
};

export async function processNewsAnalysis(limit = config.analysisBatchSize): Promise<{
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

export async function processDailySummary(targetDate = getKstDateString(new Date())): Promise<{
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
      report: {
        headline: "분석 가능한 뉴스 없음",
        marketOverview: "해당 날짜에 분석된 뉴스가 없습니다.",
        keyDevelopments: "데이터 없음",
        sectorAnalysis: "데이터 없음",
        tomorrowWatch: "다음 거래일 뉴스를 확인하세요.",
        analystNote: "분석 데이터가 충분하지 않습니다.",
      },
      metadata: {
        marketRegime: "neutral",
        topSectors: [],
        confidence: 0,
      },
      searchKeywords: [],
    });

    return { summaryDate: targetDate, analyzedCount: 0 };
  }

  const summary = await summarizeDaily(targetDate, parsed);
  await saveMarketDailySummary(targetDate, summary);

  return { summaryDate: targetDate, analyzedCount: parsed.length };
}

export async function getAnalysisStatus(): Promise<{
  statuses: { status: string; count: number }[];
}> {
  const statuses = await getRawNewsStatusCounts();
  return { statuses };
}
