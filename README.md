# Naver News Scraper (Bun + Playwright)

단일 네이버 뉴스 기사 스크래핑과 `finance.naver.com` 주요뉴스 배치 스크래핑을 지원합니다.  
추가로 CDK 기반 서버리스 파이프라인(스크래핑 -> DynamoDB 업로드 -> AI Worker 분석)까지 포함합니다.

## 구조

```text
src/
  config/constants.ts
  core/article.ts
  core/newsId.ts
  core/rawNewsRecord.ts
  core/text.ts
  core/url.ts
  io/output.ts
  pipeline/uploadRawNews.ts
  scraper/naverNewsScraper.ts
  index.ts
infra/
  bin/app.ts
  lib/news-pipeline-stack.ts
  lambda/ai-worker.ts
.github/workflows/
  deploy-infra.yml
  scrape-and-upload.yml
out/
```

## 실행

```bash
bun install
bun run start -- --url https://n.news.naver.com/mnews/article/015/0005249661
```

특정 URL 실행:

```bash
bun run start -- --url https://n.news.naver.com/mnews/article/015/0005249661
```

- 단일 모드에서 `--url`은 필수
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

DynamoDB 업로드 실행(로컬):

```bash
RAW_NEWS_TABLE=your-raw-news-table bun run pipeline:upload
```

## 결과물

- 콘솔 출력: URL, 제목, 작성일, 본문
- 파일 저장:
  - 단일 모드: `out/article.txt`, `out/article.json`
  - 주요뉴스 모드: `out/articles.txt`, `out/articles.json`, `out/failures.json`

## 서버리스 파이프라인 흐름

1. GitHub Actions가 스케줄 실행
2. `scrape:mainnews` 실행 후 `out/articles.json` 생성
3. `pipeline:upload`가 DynamoDB `raw_news` 테이블에 업로드
4. DynamoDB Streams가 AI Worker Lambda 트리거
5. AI Worker가 분석/요약 후 `news_analysis` 테이블 저장

## CDK 배포

사전 준비:

- AWS 계정/리전
- GitHub OIDC용 배포 Role(`AWS_DEPLOY_ROLE_ARN`) 준비

배포:

```bash
bun install
bun run cdk:synth -- -c stage=dev -c githubOwner=<owner> -c githubRepo=<repo> -c githubBranch=main
bun run cdk:deploy -- -c stage=dev -c githubOwner=<owner> -c githubRepo=<repo> -c githubBranch=main
```

## GitHub Actions Secrets

`deploy-infra.yml`:

- `AWS_DEPLOY_ROLE_ARN`
- `AWS_ACCOUNT_ID`
- `AWS_REGION`

`scrape-and-upload.yml`:

- `AWS_GHA_ROLE_ARN`
- `AWS_REGION`
- `RAW_NEWS_TABLE`
