FROM oven/bun:1-debian

WORKDIR /app

# 의존성 설치
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Playwright Chromium + 시스템 의존성 설치 (권장)
RUN bunx playwright install --with-deps chromium

# 소스 복사
COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
