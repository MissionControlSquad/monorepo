import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Cap the Prisma connection pool so a single container can't exhaust
 * the shared Postgres (default max_connections = 100).
 * Only appends if the URL doesn't already specify connection_limit.
 */
function withConnectionLimit(url: string, limit: number): string {
  if (url.includes("connection_limit")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}connection_limit=${limit}`;
}

function buildPrismaOptions(): ConstructorParameters<typeof PrismaClient>[0] {
  const opts: ConstructorParameters<typeof PrismaClient>[0] = {
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  };
  // Only override datasource when the env var is set (it's absent at build time)
  const dbUrl = process.env.POSTGRES_PRISMA_URL;
  if (dbUrl) {
    opts.datasources = { db: { url: withConnectionLimit(dbUrl, 5) } };
  }
  return opts;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient(buildPrismaOptions());

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Reusable where-clause fragment that excludes soft-deleted tasks */
export const notDeleted = { deletedAt: null } as const;
