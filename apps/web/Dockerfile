# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci

# ── Stage 2: Build the Next.js app ────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (needs schema + node_modules)
RUN npx prisma generate

# Build Next.js in standalone mode
ENV NEXT_PHASE=phase-production-build
RUN npm run build

# ── Stage 3: Production runner ─────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server output
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Copy Prisma schema + migrations for runtime migrate deploy
COPY --from=build /app/prisma ./prisma

# Copy agent templates (read at runtime by agent-config-generator)
COPY --from=build /app/src/server/agent-templates ./src/server/agent-templates

# Install only prisma CLI for migrations (separate from app deps)
RUN npm install prisma@6 --save-exact --no-package-lock 2>/dev/null || true

# Copy generated Prisma client (needed by app at runtime)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Create cache directory writable by nextjs user
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next/cache

# Copy entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
