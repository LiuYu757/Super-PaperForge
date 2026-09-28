FROM node:22.19.0-bookworm-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma/
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

FROM node:22.19.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma/
RUN npx prisma generate
COPY --from=builder /build/dist ./dist/
RUN groupadd --system --gid 1001 worker \
    && useradd --system --uid 1001 --gid worker --create-home worker \
    && chown -R worker:worker /app
USER worker
CMD ["node", "dist/index.js"]
