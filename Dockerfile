FROM oven/bun:1-debian

# Playwright 시스템 의존성 설치
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    fonts-liberation \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 설치
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Playwright Chromium 설치
RUN bunx playwright install chromium

# 소스 복사
COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
