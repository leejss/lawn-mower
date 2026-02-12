import { createClient } from "@supabase/supabase-js";
import type { Article } from "../core/article";
import { toNewsId } from "../core/newsId";
import type { RawNewsRecord } from "../core/rawNewsRecord";

const getSupabaseClient = () => {
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

  // Upsert records (insert or update if news_id exists)
  const { error } = await supabase.from("raw_news").upsert(records, {
    onConflict: "news_id",
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`Failed to save articles to Supabase: ${error.message}`);
  }
}
