# ── Build context: monorepo root ──────────────────────────────────
# Build with: docker build -f apps/web/Dockerfile .

# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Copy workspace manifests (for npm workspaces install)
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/graphql-server/package.json ./packages/graphql-server/package.json
COPY packages/graphql-client/package.json ./packages/graphql-client/package.json
COPY packages/graphql-client-config/package.json ./packages/graphql-client-config/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/utils/package.json ./packages/utils/package.json

# Copy prisma schema so `prisma generate` can run during npm ci postinstall hooks
COPY packages/database/prisma ./packages/database/prisma

RUN npm ci --workspace=apps/web --include-workspace-root

# ── Stage 2: Build the Next.js app ────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Copy all installed dependencies (includes workspace-level node_modules)
COPY --from=deps /app .
# Overlay source code (node_modules excluded by .dockerignore)
COPY . .

# Generate Prisma client from packages/database schema
# (outputs pothos-types.ts → packages/graphql-server/src/generated/)
RUN cd packages/database && npx prisma generate

# Build Next.js in standalone mode
WORKDIR /app/apps/web
ENV NEXT_PHASE=phase-production-build
RUN npm run build

# Bundle custom server (adds WebSocket support for GraphQL subscriptions)
RUN npm run build:server

# ── Stage 3: Production runner ─────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

LABEL org.opencontainers.image.title="AgentCenter"
LABEL org.opencontainers.image.description="Self-hosted AI agent management platform. Orchestrate, schedule, and monitor AI agents from a single dashboard."
LABEL org.opencontainers.image.url="https://agentcenter.cloud"
LABEL org.opencontainers.image.source="https://github.com/MissionControlSquad/app"
LABEL org.opencontainers.image.documentation="https://github.com/MissionControlSquad/app/blob/main/self-hosted/SETUP.md"
LABEL org.opencontainers.image.vendor="AgentCenter"
LABEL org.opencontainers.image.licenses="Proprietary"

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server output (preserves monorepo structure)
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

# Copy bundled custom server (WebSocket support for GraphQL subscriptions)
COPY --from=build /app/apps/web/server.cjs ./apps/web/server.cjs

# Copy Prisma schema + migrations for runtime migrate deploy
COPY --from=build /app/packages/database/prisma ./prisma
# Copy Prisma config (needed by migrate deploy to resolve schema/migration paths)
COPY --from=build /app/packages/database/prisma.config.ts ./prisma.config.ts
# Prisma resolves migrations relative to the schema directory (prisma/schema/),
# but our migrations live at prisma/migrations/. Symlink so Prisma finds them.
RUN ln -s /app/prisma/migrations /app/prisma/schema/migrations

# Copy agent templates (read at runtime by agent-config-generator)
COPY --from=build /app/apps/web/src/server/agent-templates ./apps/web/src/server/agent-templates

# Install Prisma CLI in a separate directory so npm doesn't prune standalone node_modules
RUN mkdir -p /prisma-cli && cd /prisma-cli && \
    echo '{"private":true}' > package.json && \
    npm install prisma@6.19.2 --save-exact

# Copy generated Prisma client (needed by app at runtime)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Create cache + data directories writable by nextjs user
RUN mkdir -p apps/web/.next/cache data && chown -R nextjs:nodejs apps/web/.next/cache data

# Copy entrypoint
COPY apps/web/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
