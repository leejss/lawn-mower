import {
	getAnalysisStatus,
	getMarketDailySummariesList,
	getMarketDailySummary,
	getNewsAnalysesList,
	getNewsAnalysisById,
} from "../analysis/service";
import { config } from "../config";
import type { JobController } from "../scheduler/jobs";

const FAILED_RETRY_DEFAULT_LIMIT = 20;
const FAILED_RETRY_MAX_LIMIT = 100;
const FAILED_RETRY_DEFAULT_SINCE_HOURS = 24;
const FAILED_RETRY_MAX_SINCE_HOURS = 24 * 7;

const getBearerToken = (authorizationHeader: string | null): string | null => {
	if (!authorizationHeader) {
		return null;
	}

	const [scheme, token] = authorizationHeader.split(" ");
	if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
		return null;
	}

	return token;
};

export const createApiHandler =
	(jobController: JobController) =>
	(req: Request): Promise<Response> | Response => {
		const url = new URL(req.url);
		const triggerToken = config.triggerToken;

		if (url.pathname === "/health") {
			return new Response("OK", { status: 200 });
		}

		if (url.pathname === "/trigger-scrape") {
			if (req.method !== "POST") {
				return new Response("Method Not Allowed", {
					status: 405,
					headers: { Allow: "POST" },
				});
			}

			if (!triggerToken) {
				console.error("TRIGGER_TOKEN is not configured");
				return new Response("Trigger token is not configured", { status: 503 });
			}

			const providedToken = getBearerToken(req.headers.get("authorization"));
			if (!providedToken) {
				return new Response("Unauthorized", {
					status: 401,
					headers: { "WWW-Authenticate": 'Bearer realm="trigger-scrape"' },
				});
			}

			if (providedToken !== triggerToken) {
				return new Response("Forbidden", { status: 403 });
			}

			const result = jobController.triggerScrape("manual");
			if (!result.started) {
				console.warn(`Manual trigger rejected: scrape already running since ${result.runningSince ?? "unknown"}`);
				return new Response("Scrape is already running", { status: 409 });
			}

			return new Response("Scraping job triggered", { status: 202 });
		}

		if (url.pathname === "/trigger-analysis") {
			if (req.method !== "POST") {
				return new Response("Method Not Allowed", {
					status: 405,
					headers: { Allow: "POST" },
				});
			}

			if (!triggerToken) {
				console.error("TRIGGER_TOKEN is not configured");
				return new Response("Trigger token is not configured", { status: 503 });
			}

			const providedToken = getBearerToken(req.headers.get("authorization"));
			if (!providedToken) {
				return new Response("Unauthorized", {
					status: 401,
					headers: { "WWW-Authenticate": 'Bearer realm="trigger-analysis"' },
				});
			}

			if (providedToken !== triggerToken) {
				return new Response("Forbidden", { status: 403 });
			}

			const result = jobController.triggerAnalysis("manual");
			if (!result.started) {
				console.warn(`Manual analysis trigger rejected: already running since ${result.runningSince ?? "unknown"}`);
				return new Response("Analysis is already running", { status: 409 });
			}

			return new Response("Analysis job triggered", { status: 202 });
		}

		if (url.pathname === "/retry-failed-analysis") {
			if (req.method !== "POST") {
				return new Response("Method Not Allowed", {
					status: 405,
					headers: { Allow: "POST" },
				});
			}

			if (!triggerToken) {
				console.error("TRIGGER_TOKEN is not configured");
				return new Response("Trigger token is not configured", { status: 503 });
			}

			const providedToken = getBearerToken(req.headers.get("authorization"));
			if (!providedToken) {
				return new Response("Unauthorized", {
					status: 401,
					headers: { "WWW-Authenticate": 'Bearer realm="retry-failed-analysis"' },
				});
			}

			if (providedToken !== triggerToken) {
				return new Response("Forbidden", { status: 403 });
			}

			const limit = Number.parseInt(url.searchParams.get("limit") ?? `${FAILED_RETRY_DEFAULT_LIMIT}`, 10);
			const sinceHours = Number.parseInt(
				url.searchParams.get("sinceHours") ?? `${FAILED_RETRY_DEFAULT_SINCE_HOURS}`,
				10,
			);

			if (
				Number.isNaN(limit) ||
				Number.isNaN(sinceHours) ||
				limit < 1 ||
				sinceHours < 1 ||
				limit > FAILED_RETRY_MAX_LIMIT ||
				sinceHours > FAILED_RETRY_MAX_SINCE_HOURS
			) {
				return new Response(
					`Invalid retry parameters. limit=1..${FAILED_RETRY_MAX_LIMIT}, sinceHours=1..${FAILED_RETRY_MAX_SINCE_HOURS}`,
					{ status: 400 },
				);
			}

			const result = jobController.triggerFailedAnalysisRetry("retry_manual", { limit, sinceHours });
			if (!result.started) {
				console.warn(
					`Manual failed-analysis retry rejected: already running since ${result.runningSince ?? "unknown"}`,
				);
				return new Response("Analysis is already running", { status: 409 });
			}

			return new Response("Failed analysis retry job triggered", { status: 202 });
		}

		if (url.pathname === "/analysis/status") {
			if (req.method !== "GET") {
				return new Response("Method Not Allowed", {
					status: 405,
					headers: { Allow: "GET" },
				});
			}

			return getAnalysisStatus()
				.then((status) => {
					const state = jobController.getRuntimeState();

					return Response.json({
						running: state.isAnalysisRunning,
						runningSince: state.analysisStartedAtIso,
						...status,
					});
				})
				.catch((error) => {
					console.error("Failed to fetch analysis status", error);
					return new Response("Failed to fetch analysis status", { status: 500 });
				});
		}

		if (url.pathname.startsWith("/api/analysis/")) {
			if (req.method !== "GET") {
				return new Response("Method Not Allowed", {
					status: 405,
					headers: { Allow: "GET" },
				});
			}

			const newsId = url.pathname.replace("/api/analysis/", "");
			if (!newsId) {
				return new Response("News ID is required", { status: 400 });
			}

			return getNewsAnalysisById(newsId)
				.then((result) => {
					if (!result) {
						return new Response("Analysis not found", { status: 404 });
					}
					return Response.json({ success: true, data: result });
				})
				.catch((error) => {
					console.error("Failed to fetch news analysis", error);
					return new Response("Failed to fetch news analysis", { status: 500 });
				});
		}

		if (url.pathname === "/api/analysis") {
			if (req.method !== "GET") {
				return new Response("Method Not Allowed", {
					status: 405,
					headers: { Allow: "GET" },
				});
			}

			const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
			const pageSize = Math.min(Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10), 100);

			if (page < 1 || pageSize < 1) {
				return new Response("Invalid pagination parameters", { status: 400 });
			}

			return getNewsAnalysesList(page, pageSize)
				.then((result) => Response.json({ success: true, ...result }))
				.catch((error) => {
					console.error("Failed to fetch news analyses list", error);
					return new Response("Failed to fetch news analyses list", { status: 500 });
				});
		}

		if (url.pathname.startsWith("/api/summary/")) {
			if (req.method !== "GET") {
				return new Response("Method Not Allowed", {
					status: 405,
					headers: { Allow: "GET" },
				});
			}

			const summaryDate = url.pathname.replace("/api/summary/", "");
			if (!summaryDate || !/^\d{4}-\d{2}-\d{2}$/.test(summaryDate)) {
				return new Response("Invalid date format. Use YYYY-MM-DD", { status: 400 });
			}

			return getMarketDailySummary(summaryDate)
				.then((result) => {
					if (!result) {
						return new Response("Summary not found", { status: 404 });
					}
					return Response.json({ success: true, data: result });
				})
				.catch((error) => {
					console.error("Failed to fetch market daily summary", error);
					return new Response("Failed to fetch market daily summary", { status: 500 });
				});
		}

		if (url.pathname === "/api/summary") {
			if (req.method !== "GET") {
				return new Response("Method Not Allowed", {
					status: 405,
					headers: { Allow: "GET" },
				});
			}

			const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
			const pageSize = Math.min(Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10), 100);

			if (page < 1 || pageSize < 1) {
				return new Response("Invalid pagination parameters", { status: 400 });
			}

			return getMarketDailySummariesList(page, pageSize)
				.then((result) => Response.json({ success: true, ...result }))
				.catch((error) => {
					console.error("Failed to fetch market daily summaries list", error);
					return new Response("Failed to fetch market daily summaries list", { status: 500 });
				});
		}

		return new Response("Naver News Scraper", { status: 200 });
	};
