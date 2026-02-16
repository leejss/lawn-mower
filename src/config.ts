import { z } from "zod";

const configSchema = z.object({
	// 서버
	port: z.number().default(3000),
	env: z.enum(["development", "production", "test"]).default("development"),

	// 스크래핑
	headless: z.boolean().default(true),
	pageTimeoutMs: z.number().default(30000),
	waitTimeoutMs: z.number().default(15000),
	mainnewsUrl: z.string().url().default("https://finance.naver.com/news/mainnews.naver"),
	mainnewsLimit: z.number().default(10),
	concurrency: z.number().default(3),

	// AI 분석
	aiModel: z.string().default("gpt-5.2"),
	analysisBatchSize: z.number().default(20),

	// 스케줄
	scrapeSchedule: z.string().default("0 9 * * *"),
	analysisSchedule: z.string().default("0 10 * * *"),

	// 출력
	outputDir: z.string().default("out"),

	// 민감 정보 (기능별 런타임에서 검증)
	supabaseUrl: z.string().min(1).optional(),
	supabaseKey: z.string().min(1).optional(),
	openaiKey: z.string().min(1).optional(),
	triggerToken: z.string().min(1).optional(),
});

type Config = z.infer<typeof configSchema>;

const createConfig = (): Config => {
	const isProd = process.env.NODE_ENV === "production";
	const isDev = !isProd && process.env.NODE_ENV !== "test";

	const raw = {
		// 서버
		port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
		env: (process.env.NODE_ENV as Config["env"]) || "development",

		// 스크래핑 (개발 환경에서는 브라우저 보이게)
		headless: isProd ? true : process.env.PLAYWRIGHT_HEADLESS !== "false",
		pageTimeoutMs: 30000,
		waitTimeoutMs: 15000,
		mainnewsUrl: "https://finance.naver.com/news/mainnews.naver",
		mainnewsLimit: 20,
		concurrency: 3,

		// AI 분석
		aiModel: "gpt-5.2",
		analysisBatchSize: isDev ? 5 : 20,

		// 스케줄
		scrapeSchedule: "0 9 * * *",
		analysisSchedule: "0 10 * * *",

		// 출력
		outputDir: "out",

		// 민감 정보
		supabaseUrl: process.env.SUPABASE_URL,
		supabaseKey: process.env.SUPABASE_SERVICE_KEY,
		openaiKey: process.env.OPENAI_API_KEY,
		triggerToken: process.env.TRIGGER_TOKEN,
	};

	const result = configSchema.safeParse(raw);

	if (!result.success) {
		console.error("❌ Config validation failed:");
		for (const [key, errors] of Object.entries(result.error.flatten().fieldErrors)) {
			console.error(`  ${key}: ${errors.join(", ")}`);
		}
		process.exit(1);
	}

	return result.data;
};

export const config = createConfig();
export type { Config };
