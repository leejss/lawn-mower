# Naver News Scraper (Bun + Playwright)

단일 네이버 뉴스 기사 스크래핑과 `finance.naver.com` 주요뉴스 배치 스크래핑을 지원합니다.

## 구조

```text
src/
  config/constants.ts
  core/article.ts
  core/text.ts
  core/url.ts
  io/output.ts
  scraper/naverNewsScraper.ts
  index.ts
out/
```

## 실행

```bash
bun install
bun run start
```

특정 URL 실행:

```bash
bun run start -- --url https://n.news.naver.com/mnews/article/015/0005249661
```

- 기본 URL: `https://n.news.naver.com/mnews/article/015/0005249661`
- 지원 URL 형식: `https://n.news.naver.com/mnews/article/{officeId}/{articleId}`
- 브라우저 실행 옵션: `headless: false`

주요뉴스 배치 실행:

```bash
bun run start -- --mainnews --page 1 --limit 5 --concurrency 3
```

- `--mainnews`: 주요뉴스 모드 활성화
- `--page`: `mainnews.naver` 페이지 번호(기본 1)
- `--limit`: 수집할 최대 기사 수(기본 10)
- `--concurrency`: 병렬 스크래핑 동시성(기본 3)

## 결과물

- 콘솔 출력: URL, 제목, 작성일, 본문
- 파일 저장:
  - 단일 모드: `out/article.txt`, `out/article.json`
  - 주요뉴스 모드: `out/articles.txt`, `out/articles.json`, `out/failures.json`
