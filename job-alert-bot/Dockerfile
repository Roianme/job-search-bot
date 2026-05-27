# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src          ./src
COPY --from=builder /app/index.js     ./index.js
COPY --from=builder /app/config.js    ./config.js
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/jobs.db

CMD ["node", "index.js"]
