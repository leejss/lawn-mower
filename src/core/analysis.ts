export type AnalysisQuestion = {
	question: string;
	purpose: string;
};

export type NewsAnalysisResult = {
	report: {
		headline: string;
		body: string;
		outlook: string;
	};
	analysisQuestions: AnalysisQuestion[];
};

export type MarketDailySummary = {
	summaryDate: string;
	report: {
		headline: string;
		summary: string;
		outlook: string;
		analystNote: string;
	};
	analysisQuestions: AnalysisQuestion[];
};
