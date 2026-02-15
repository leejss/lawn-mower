import { createClient } from "@supabase/supabase-js";
import type { Article } from "../core/article";
import { toNewsId } from "../core/newsId";
import type { RawNewsRecord } from "../core/rawNewsRecord";

type RawNewsStatus = RawNewsRecord["status"];

export type PendingRawNewsRecord = Pick<
  RawNewsRecord,
  "news_id" | "title" | "body" | "published_at" | "collected_at" | "source"
>;

type RawNewsStatusCountRow = {
  status: RawNewsStatus;
  count: number;
};

type AnalysisRow = {
  news_id: string;
  analyzed_at: string;
  analysis_result: unknown;
};

export const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required");
  }

  return createClient(supabaseUrl, supabaseKey);
};

const toRawNewsRecord = (article: Article, source: RawNewsRecord["source"], nowIso: string): RawNewsRecord => ({
  news_id: toNewsId(article.url),
  url: article.url,
  title: article.title,
  body: article.body,
  published_at: article.publishedAt,
  collected_at: nowIso,
  source,
  status: "PENDING",
  version: 1,
  last_seen_at: nowIso,
});

export async function saveArticlesToSupabase(
  articles: Article[],
  source: RawNewsRecord["source"] = "naver_finance_mainnews",
): Promise<void> {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  const records = articles.map((article) => toRawNewsRecord(article, source, nowIso));

  const { error } = await supabase.from("raw_news").upsert(records, {
    onConflict: "news_id",
    ignoreDuplicates: true,
  });

  if (error) {
    throw new Error(`Failed to save articles to Supabase: ${error.message}`);
  }
}

export async function fetchPendingRawNews(limit: number): Promise<PendingRawNewsRecord[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("raw_news")
    .select("news_id, title, body, published_at, collected_at, source")
    .eq("status", "PENDING")
    .order("collected_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch pending raw_news: ${error.message}`);
  }

  return (data ?? []) as PendingRawNewsRecord[];
}

export async function tryMarkRawNewsAsProcessing(newsId: string): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("raw_news")
    .update({ status: "PROCESSING" satisfies RawNewsStatus })
    .eq("news_id", newsId)
    .eq("status", "PENDING")
    .select("news_id");

  if (error) {
    throw new Error(`Failed to mark raw_news PROCESSING: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}

export async function updateRawNewsStatus(newsId: string, status: RawNewsStatus): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("raw_news").update({ status }).eq("news_id", newsId);

  if (error) {
    throw new Error(`Failed to update raw_news status: ${error.message}`);
  }
}

export async function saveNewsAnalysis(newsId: string, analysisResult: unknown): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("news_analysis").upsert(
    {
      news_id: newsId,
      analysis_result: analysisResult,
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: "news_id" },
  );

  if (error) {
    throw new Error(`Failed to save news analysis: ${error.message}`);
  }
}

export async function fetchNewsAnalysesByDate(summaryDate: string): Promise<AnalysisRow[]> {
  const supabase = getSupabaseClient();
  const [year, month, day] = summaryDate.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid summaryDate format: ${summaryDate}`);
  }

  const kstOffsetHours = 9;
  const startUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - kstOffsetHours * 60 * 60 * 1000;
  const endExclusiveUtcMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - kstOffsetHours * 60 * 60 * 1000;
  const start = new Date(startUtcMs).toISOString();
  const endExclusive = new Date(endExclusiveUtcMs).toISOString();

  const { data, error } = await supabase
    .from("news_analysis")
    .select("news_id, analyzed_at, analysis_result")
    .gte("analyzed_at", start)
    .lt("analyzed_at", endExclusive)
    .order("analyzed_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch daily analyses: ${error.message}`);
  }

  return (data ?? []) as AnalysisRow[];
}

export async function saveMarketDailySummary(summaryDate: string, summaryResult: unknown): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("market_daily_summary").upsert(
    {
      summary_date: summaryDate,
      summary_result: summaryResult,
    },
    { onConflict: "summary_date" },
  );

  if (error) {
    throw new Error(`Failed to save market daily summary: ${error.message}`);
  }
}

export async function getRawNewsStatusCounts(): Promise<RawNewsStatusCountRow[]> {
  const supabase = getSupabaseClient();
  const statuses: RawNewsStatus[] = ["PENDING", "PROCESSING", "DONE", "FAILED"];

  return Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("raw_news")
        .select("news_id", { count: "exact", head: true })
        .eq("status", status);

      if (error) {
        throw new Error(`Failed to fetch raw_news status count (${status}): ${error.message}`);
      }

      return { status, count: count ?? 0 };
    }),
  );
}
