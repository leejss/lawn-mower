# Naver News Scraper (Bun + Playwright)

네이버 뉴스 기사를 자동으로 스크래핑하여 Supabase에 저장하는 시스템입니다.
Railway에서 24/7 실행되며, 매일 자동으로 뉴스를 수집합니다.

## 🏗️ 아키텍처

```
Railway (상시 실행)
├── Bun Server
├── Playwright + Chromium
└── Cron Scheduler (매일 9시)
     ↓
Supabase PostgreSQL
├── raw_news 테이블
└── news_analysis 테이블
```

## 📁 프로젝트 구조

```
src/
  config/constants.ts          # 설정 상수
  core/                         # 핵심 타입 정의
    article.ts
    newsId.ts
    rawNewsRecord.ts
    text.ts
    url.ts
  database/
    supabase.ts                 # Supabase 클라이언트
  scraper/
    mainnewsCollector.ts        # 뉴스 URL 수집
    naverNewsScraper.ts         # Playwright 스크래핑
  services/
    scrapeService.ts            # 스크래핑 + 업로드 로직
  io/output.ts                  # 파일 출력
  index.ts                      # CLI 진입점
server.ts                       # Railway 서버 (Cron + API)
supabase/
  schema.sql                    # DB 스키마
```

## 🚀 로컬 개발

### 1. 설치

```bash
bun install
bunx playwright install chromium
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일에 Supabase 정보 입력:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
PLAYWRIGHT_HEADLESS=true
```

### 3. 로컬 실행

**단일 기사 스크래핑:**
```bash
bun run scrape:single
```

**주요뉴스 배치 스크래핑:**
```bash
bun run scrape:mainnews
# 또는 옵션 지정:
bun run start -- --mainnews --page 1 --limit 10 --concurrency 3
```

**서버 실행 (Cron + API):**
```bash
bun run dev
```

서버가 실행되면:
- Health check: `http://localhost:3000/health`
- 수동 스크래핑 트리거: `http://localhost:3000/trigger-scrape`

## 📤 배포

자세한 배포 가이드는 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참고하세요.

### 간단 요약

1. **Supabase 프로젝트 생성** 후 `supabase/schema.sql` 실행
2. **Railway에서 GitHub repo 연결**
3. **환경 변수 설정**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `PLAYWRIGHT_HEADLESS=true`
4. 자동 배포 완료!

## ⏰ 스케줄링

서버는 매일 오전 9시 (한국 시간)에 자동으로 스크래핑을 실행합니다.

스케줄 변경: `server.ts`의 cron 표현식 수정
```typescript
cron.schedule("0 9 * * *", ...)  // 매일 9시
cron.schedule("0 */6 * * *", ...) // 6시간마다
```

## 🔌 API 엔드포인트

- `GET /health` - 헬스 체크
- `GET /trigger-scrape` - 수동 스크래핑 트리거
- `GET /` - 서비스 정보

## 💰 비용

- **Railway Hobby**: $5/월
- **Supabase Free**: $0/월 (500MB DB)

**총**: $5/월

## 📝 결과물

로컬 스크래핑 시 `out/` 디렉토리에 저장:
- `articles.json` - 스크래핑한 기사 JSON
- `articles.txt` - 텍스트 형식 기사
- `failures.json` - 실패한 URL 목록

## 🛠️ 트러블슈팅

문제 발생 시 [DEPLOYMENT.md](./DEPLOYMENT.md)의 트러블슈팅 섹션을 참고하세요.
