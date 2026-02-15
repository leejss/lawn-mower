export type SentimentLabel = "bullish" | "neutral" | "bearish";

export type SearchKeyword = {
  keyword: string;
  purpose: string;
  dataSource: string;
};

export type NewsAnalysisResult = {
  report: {
    headline: string;
    analysis: string;
    marketImpact: string;
    watchList: string;
    outlook: string;
  };
  metadata: {
    sentiment: SentimentLabel;
    sectors: string[];
    confidence: number;
  };
  searchKeywords: SearchKeyword[];
};

export type MarketDailySummary = {
  summaryDate: string;
  report: {
    headline: string;
    marketOverview: string;
    keyDevelopments: string;
    sectorAnalysis: string;
    tomorrowWatch: string;
    analystNote: string;
  };
  metadata: {
    marketRegime: "risk_on" | "neutral" | "risk_off";
    topSectors: string[];
    confidence: number;
  };
  searchKeywords: SearchKeyword[];
};
