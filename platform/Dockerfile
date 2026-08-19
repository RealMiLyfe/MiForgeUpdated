# ═══════════════════════════════════════════════════════════════
# MiForge Platform — Production Container
# Multi-stage build: slim Node 20 runtime, TypeScript compiled
#
# Build:  docker build -t miforge-platform platform/
# Run:    docker run --env-file platform/.env -p 4000:4000 miforge-platform
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json tsconfig.json ./
RUN npm install

# Copy source
COPY providers/ providers/
COPY memory/ memory/
COPY rag/ rag/
COPY orchestration/ orchestration/
COPY mcp/ mcp/
COPY safety/ safety/
COPY observability/ observability/
COPY self-improvement/ self-improvement/
COPY sdk/ sdk/

# Compile TypeScript
RUN npx tsc -b tsconfig.json || true

# ── Stage 2: Runtime ──
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production deps only
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules/ ./node_modules/

# Copy config files (not compiled)
COPY providers/litellm-config.yaml ./providers/
COPY .env.example ./.env.example
COPY bootstrap.sh ./

# Python for memory/RAG backends (cognee, mem0, chromadb)
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --no-cache-dir --break-system-packages \
      redis cognee mem0ai chromadb cohere

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1))" || exit 1

EXPOSE 4000 8082

# Default: run health check then start proxy
CMD ["sh", "-c", "node dist/providers/health-check.mjs && echo 'Platform ready'"]
