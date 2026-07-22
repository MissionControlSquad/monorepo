import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { PluginLog } from "@agentcenter/database";

// Plugin logs + retention (parity #117). Append-only log lines a plugin emits, with an age/count
// retention sweep so the table doesn't grow unbounded. Workspace + plugin scoped. The worker writes;
// the operator UI reads; the heartbeat prunes.

const LEVELS = new Set(["debug", "info", "warn", "error"]);
const MAX_MESSAGE = 8_000;

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function recordPluginLog(input: {
  workspaceId: string;
  pluginId: string;
  level: string;
  message: string;
  data?: unknown;
}): Promise<PluginLog> {
  if (!LEVELS.has(input.level)) badRequest("level must be one of: debug, info, warn, error");
  return prisma.pluginLog.create({
    data: {
      workspaceId: input.workspaceId,
      pluginId: input.pluginId,
      level: input.level,
      message: (input.message ?? "").slice(0, MAX_MESSAGE),
      data: (input.data ?? undefined) as never,
    },
  });
}

export function listPluginLogs(
  workspaceId: string,
  pluginId: string,
  opts: { level?: string; limit?: number } = {},
): Promise<PluginLog[]> {
  return prisma.pluginLog.findMany({
    where: { workspaceId, pluginId, ...(opts.level ? { level: opts.level } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(1000, opts.limit ?? 200),
  });
}

/**
 * Retention sweep (#117): delete a plugin's logs older than `maxAgeDays`, then, if still over
 * `maxRows`, trim the oldest surplus. Returns the total deleted. Pure-policy bounds, DB-executed.
 */
export async function prunePluginLogs(
  workspaceId: string,
  pluginId: string,
  policy: { maxAgeDays?: number; maxRows?: number } = {},
): Promise<number> {
  const maxAgeDays = policy.maxAgeDays ?? 30;
  const maxRows = policy.maxRows ?? 10_000;
  let deleted = 0;

  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000);
  const aged = await prisma.pluginLog.deleteMany({
    where: { workspaceId, pluginId, createdAt: { lt: cutoff } },
  });
  deleted += aged.count;

  const remaining = await prisma.pluginLog.count({ where: { workspaceId, pluginId } });
  if (remaining > maxRows) {
    const surplus = remaining - maxRows;
    const oldest = await prisma.pluginLog.findMany({
      where: { workspaceId, pluginId },
      orderBy: { createdAt: "asc" },
      take: surplus,
      select: { id: true },
    });
    const trimmed = await prisma.pluginLog.deleteMany({
      where: { id: { in: oldest.map((r) => r.id) } },
    });
    deleted += trimmed.count;
  }
  return deleted;
}
