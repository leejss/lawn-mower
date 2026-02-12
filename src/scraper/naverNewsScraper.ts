import { type BrowserContext, chromium, type Page } from "playwright";
import { PAGE_TIMEOUT_MS, WAIT_TIMEOUT_MS } from "../config/constants";
import type { Article } from "../core/article";
import type { ScrapeFailure } from "../core/failure";
import { normalizeMultiline, normalizeSingleLine } from "../core/text";

const resolveHeadlessMode = (): boolean => {
  const raw = process.env.PLAYWRIGHT_HEADLESS;
  if (!raw) {
    // Containers (e.g. Railway) usually don't have an X server.
    // Default to headless unless explicitly disabled.
    return true;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return true;
};

const getFirstText = async (page: Page, selectors: readonly string[], multiline = false): Promise<string> => {
  for (const selector of selectors) {
    const element = page.locator(selector).first();
    if ((await element.count()) === 0) {
      continue;
    }

    const raw = await element.innerText();
    const text = multiline ? normalizeMultiline(raw) : normalizeSingleLine(raw);
    if (text.length > 0) {
      return text;
    }
  }

  return "";
};

const getPublishedAt = async (page: Page): Promise<string> => {
  const selectors = [
    ".media_end_head_info_datestamp_time._ARTICLE_DATE_TIME",
    ".media_end_head_info_datestamp_time",
    "span._ARTICLE_DATE_TIME",
  ] as const;

  for (const selector of selectors) {
    const element = page.locator(selector).first();
    if ((await element.count()) === 0) {
      continue;
    }

    const dataDateTime = await element.getAttribute("data-date-time");
    if (dataDateTime && dataDateTime.trim().length > 0) {
      return normalizeSingleLine(dataDateTime);
    }

    const text = normalizeSingleLine(await element.innerText());
    if (text.length > 0) {
      return text;
    }
  }

  return "";
};

const scrapeFromPage = async (page: Page): Promise<Article> => {
  const title = await getFirstText(page, ["#title_area > span", "#title_area", ".media_end_head_headline"]);

  const body = await getFirstText(page, ["#dic_area", "article#dic_area", ".go_trans._article_content"], true);

  const publishedAt = await getPublishedAt(page);
  const fallbackTitle = title.length > 0 ? title : normalizeSingleLine(await page.title());

  return {
    url: page.url(),
    title: fallbackTitle,
    body,
    publishedAt,
  };
};

const scrapeWithContext = async (context: BrowserContext, url: string): Promise<Article> => {
  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    await page.waitForLoadState("networkidle", { timeout: WAIT_TIMEOUT_MS }).catch(() => undefined);
    await page.waitForSelector("#dic_area", { timeout: WAIT_TIMEOUT_MS });

    return await scrapeFromPage(page);
  } finally {
    await page.close();
  }
};

export const scrapeNaverNews = async (url: string): Promise<Article> => {
  const browser = await chromium.launch({ headless: resolveHeadlessMode() });
  const context = await browser.newContext();

  try {
    return await scrapeWithContext(context, url);
  } finally {
    await context.close();
    await browser.close();
  }
};

export const scrapeNaverNewsBatch = async (
  urls: readonly string[],
  concurrency: number,
): Promise<{ articles: Article[]; failures: ScrapeFailure[] }> => {
  if (urls.length === 0) {
    return { articles: [], failures: [] };
  }

  const workerCount = Math.min(concurrency, urls.length);
  const browser = await chromium.launch({ headless: resolveHeadlessMode() });
  const context = await browser.newContext();

  const successes: (Article | undefined)[] = new Array(urls.length).fill(undefined);
  const failures: ScrapeFailure[] = [];
  let cursor = 0;

  try {
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = cursor;
        cursor += 1;

        if (currentIndex >= urls.length) {
          return;
        }

        const targetUrl = urls[currentIndex];
        if (!targetUrl) {
          return;
        }

        try {
          const article = await scrapeWithContext(context, targetUrl);
          successes[currentIndex] = article;
        } catch (error) {
          failures.push({
            url: targetUrl,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    await Promise.all(workers);
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    articles: successes.filter((item): item is Article => item !== undefined),
    failures,
  };
};
