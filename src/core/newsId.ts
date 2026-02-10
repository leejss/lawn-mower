export const toNewsId = (url: string): string => {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/mnews\/article\/(\d+)\/(\d+)/);

  if (!match) {
    throw new Error(`news_id 생성 실패: 지원하지 않는 URL 형식 (${url})`);
  }

  const officeId = match[1];
  const articleId = match[2];
  return `${officeId}#${articleId}`;
};
