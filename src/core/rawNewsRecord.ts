export type RawNewsRecord = {
  news_id: string;
  url: string;
  title: string;
  body: string;
  published_at: string;
  collected_at: string;
  source: "naver_finance_mainnews" | "naver_news_single";
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  version: number;
  last_seen_at: string;
};
