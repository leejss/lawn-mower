-- Raw news articles table
CREATE TABLE IF NOT EXISTS raw_news (
  news_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TEXT,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_raw_news_status ON raw_news(status);
CREATE INDEX IF NOT EXISTS idx_raw_news_collected_at ON raw_news(collected_at);
CREATE INDEX IF NOT EXISTS idx_raw_news_source ON raw_news(source);

-- News analysis table (for AI worker results)
CREATE TABLE IF NOT EXISTS news_analysis (
  news_id TEXT PRIMARY KEY REFERENCES raw_news(news_id),
  analysis_result JSONB,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_raw_news_updated_at BEFORE UPDATE ON raw_news
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_analysis_updated_at BEFORE UPDATE ON news_analysis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (optional, for security)
ALTER TABLE raw_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_analysis ENABLE ROW LEVEL SECURITY;

-- Policy to allow service role to access all rows
CREATE POLICY "Service role can access all raw_news" ON raw_news
  FOR ALL USING (true);

CREATE POLICY "Service role can access all news_analysis" ON news_analysis
  FOR ALL USING (true);
