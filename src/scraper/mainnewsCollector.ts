import { MAINNEWS_URL } from "../config/constants";

const buildMainnewsUrl = (page: number): string => {
	const url = new URL(MAINNEWS_URL);
	url.searchParams.set("page", String(page));
	return url.toString();
};

const toCanonicalNewsUrl = (relativeHref: string): string | null => {
	const normalizedHref = relativeHref.replace(/&amp;/g, "&");
	const url = new URL(normalizedHref, "https://finance.naver.com");

	const articleId = url.searchParams.get("article_id");
	const officeId = url.searchParams.get("office_id");

	if (!articleId || !officeId) {
		return null;
	}

	if (!/^\d+$/.test(articleId) || !/^\d+$/.test(officeId)) {
		return null;
	}

	return `https://n.news.naver.com/mnews/article/${officeId}/${articleId}`;
};

export const collectMainnewsArticleUrls = async (
	page: number,
	limit: number,
): Promise<string[]> => {
	const response = await fetch(buildMainnewsUrl(page));
	if (!response.ok) {
		throw new Error(`mainnews 요청 실패: HTTP ${response.status}`);
	}

	const html = await response.text();
	const hrefRegex = /href="(\/news\/news_read\.naver\?[^"]+)"/g;
	const urls = new Set<string>();

	let match: RegExpExecArray | null = hrefRegex.exec(html);
	while (match) {
		const href = match[1];
		if (href) {
			const canonicalUrl = toCanonicalNewsUrl(href);
			if (canonicalUrl) {
				urls.add(canonicalUrl);
			}
		}

		if (urls.size >= limit) {
			break;
		}

		match = hrefRegex.exec(html);
	}

	return Array.from(urls);
};
