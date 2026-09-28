# ── Build Stage ──
# Compiles TypeScript from source. The previous single-stage image did
# `COPY dist ./dist` and relied on a pre-built dist, so it could not build from
# a clean checkout.
FROM node:22.19.0-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime Stage ──
FROM node:22.19.0-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=builder /build/dist ./dist

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs collab \
    && chown -R collab:nodejs /app
USER collab

EXPOSE 4001
CMD ["node", "dist/index.js"]
