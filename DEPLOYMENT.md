# Railway + Supabase 배포 가이드

이 프로젝트는 Railway (상시 실행 서버)와 Supabase (PostgreSQL DB)를 사용합니다.

## 📋 사전 준비

1. **Supabase 프로젝트 생성**
   - https://supabase.com 에서 계정 생성
   - 새 프로젝트 생성
   - `supabase/schema.sql` 파일 실행 (SQL Editor에서)

2. **Railway 계정 생성**
   - https://railway.app 에서 계정 생성
   - GitHub 계정 연동

## 🚀 배포 단계

### 1. Supabase 설정

1. Supabase Dashboard → Settings → API
   - `Project URL` 복사 (예: `https://abcdefgh.supabase.co`)
   - `service_role` key 복사 (secret key, anon key 아님!)

2. SQL Editor에서 스키마 생성:
   ```sql
   -- supabase/schema.sql 파일 내용을 복사해서 실행
   ```

### 2. Railway 배포

1. **Railway에서 새 프로젝트 생성**
   ```bash
   # GitHub repo 연결
   Railway Dashboard → New Project → Deploy from GitHub repo
   ```

2. **환경 변수 설정**

   Railway Dashboard → 프로젝트 → Variables 탭:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key-here
   PLAYWRIGHT_HEADLESS=true
   ```

3. **자동 배포 시작**
   - `main` 브랜치에 푸시하면 자동 배포됨
   - 빌드 로그 확인: Railway Dashboard → Deployments

### 3. 배포 확인

1. **Health Check**
   ```bash
   curl https://your-app.railway.app/health
   # 응답: OK
   ```

2. **수동 스크래핑 트리거**
   ```bash
   curl https://your-app.railway.app/trigger-scrape
   # 응답: Scraping job triggered
   ```

3. **로그 확인**
   ```
   Railway Dashboard → Deployments → View Logs
   ```

## ⏰ 스케줄링

서버가 매일 오전 9시 (KST)에 자동으로 스크래핑을 실행합니다.

변경하려면 `server.ts` 파일의 cron 표현식 수정:
```typescript
cron.schedule("0 9 * * *", ...  // 매일 9시
cron.schedule("0 */6 * * *", ... // 6시간마다
```

## 💰 비용

- **Railway Hobby**: $5/월 (512MB RAM, 충분함)
- **Supabase Free**: $0/월 (500MB DB, 2GB 전송)

**총 예상 비용**: $5/월

## 🔧 로컬 개발

```bash
# 환경 변수 설정
cp .env.example .env
# .env 파일에 Supabase 정보 입력

# Playwright 브라우저 설치
bunx playwright install chromium

# 개발 서버 실행
bun run dev

# 다른 터미널에서 테스트
curl http://localhost:3000/health
curl http://localhost:3000/trigger-scrape
```

## 🐛 트러블슈팅

### Chromium 설치 실패
Railway 빌드 로그에서 Chromium 설치 실패 시:
```bash
# nixpacks.toml 확인
# railway.json의 buildCommand 확인
```

### Supabase 연결 실패
```bash
# 환경변수 확인
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY

# service_role key인지 확인 (anon key 아님!)
```

### Cron이 실행 안됨
```bash
# Railway 로그에서 확인
# Timezone 설정 확인 (server.ts의 timezone: "Asia/Seoul")
```

## 📚 추가 리소스

- [Railway Documentation](https://docs.railway.app)
- [Supabase Documentation](https://supabase.com/docs)
- [Playwright Documentation](https://playwright.dev)
