# syntax=docker/dockerfile:1.7
# Multi-stage build for AgentFlow (Next.js 14 + better-sqlite3).
# Result: ~150MB Alpine-based image, single process, data/ as a mountable volume.

# ---------- builder ----------
FROM node:20-alpine AS builder

WORKDIR /app

# better-sqlite3 needs a C++ toolchain at build time. Drop it from the runtime layer.
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Strip dev tooling cache; build the standalone Next.js output for slim runtime.
RUN AGENTFLOW_PASSWORD=docker-build-stub \
    AGENTFLOW_BUILD_SHA=docker-build \
    npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime

WORKDIR /app

# libc6-compat keeps better-sqlite3's native binding happy on Alpine.
RUN apk add --no-cache libc6-compat tini && addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production
ENV PORT=3000
ENV AGENTFLOW_DB=/app/data/agent-flow.db

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/data && chown -R app:app /app

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# tini handles PID 1 signal forwarding so SIGTERM/SIGINT reach Next.js cleanly.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start"]
