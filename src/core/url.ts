import {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAINNEWS_LIMIT,
  DEFAULT_MAINNEWS_PAGE,
} from "../config/constants";
import type { RunOptions } from "./runOptions";

const getArgValue = (argv: string[], key: string): string | undefined => {
  const index = argv.findIndex((arg) => arg === key);
  return index === -1 ? undefined : argv[index + 1];
};

const parsePositiveInt = (value: string | undefined, key: string, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`\`${key}\` 는 1 이상의 정수여야 합니다. 입력값: ${value}`);
  }

  return parsed;
};

export const parseArgs = (argv: string[]): RunOptions => {
  const isMainnewsMode = argv.includes("--mainnews");

  if (isMainnewsMode) {
    const page = parsePositiveInt(getArgValue(argv, "--page"), "--page", DEFAULT_MAINNEWS_PAGE);
    const limit = parsePositiveInt(getArgValue(argv, "--limit"), "--limit", DEFAULT_MAINNEWS_LIMIT);
    const concurrency = parsePositiveInt(
      getArgValue(argv, "--concurrency"),
      "--concurrency",
      DEFAULT_CONCURRENCY
    );

    return {
      mode: "mainnews",
      page,
      limit,
      concurrency,
    };
  }

  const url = getArgValue(argv, "--url");
  if (!url || url.trim().length === 0) {
    throw new Error(
      "`--url` 은 필수입니다. 예: bun run start -- --url https://n.news.naver.com/mnews/article/015/0005249661"
    );
  }

  return { mode: "single", url };
};

export const validateNaverNewsUrl = (rawUrl: string): string => {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`유효하지 않은 URL입니다: ${rawUrl}`);
  }

  const isHttps = parsed.protocol === "https:";
  const isNaverNewsHost = parsed.hostname === "n.news.naver.com";
  const hasArticlePath = /^\/mnews\/article\/\d+\/\d+/.test(parsed.pathname);

  if (!isHttps || !isNaverNewsHost || !hasArticlePath) {
    throw new Error(
      "현재는 네이버 뉴스 기사 URL만 지원합니다. 예: https://n.news.naver.com/mnews/article/015/0005249661"
    );
  }

  return parsed.toString();
};
