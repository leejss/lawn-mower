export type SentimentLabel = "bullish" | "neutral" | "bearish";

export type AnalysisKeyword = {
  keyword: string;
  score: number;
  reason: string;
};

export type CapitalFlowSignal = {
  direction: "inflow" | "outflow" | "neutral";
  participants: ("foreign" | "institutional" | "retail")[];
  rationale: string;
};

export type NextKeyword = {
  keyword: string;
  reason: string;
  confidence: number;
  followMetrics: string[];
};

export type NewsAnalysisResult = {
  sentimentLabel: SentimentLabel;
  sentimentScore: number;
  sectors: string[];
  keywords: AnalysisKeyword[];
  capitalFlowSignal: CapitalFlowSignal;
  confidence: number;
  summary: string;
  nextKeywords: NextKeyword[];
};

export type MarketDailySummary = {
  summaryDate: string;
  marketRegime: "risk_on" | "neutral" | "risk_off";
  highlights: string[];
  topSectors: string[];
  topKeywords: string[];
  nextKeywords: NextKeyword[];
  confidence: number;
  summary: string;
};
