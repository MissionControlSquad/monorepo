import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { LocalService } from "@agentcenter/database";
import { shouldRestartService, shouldEvictIdle, type RestartDecision } from "@agentcenter/utils";

// Local service supervision (parity #95). Registry + observed state for local_stdio services; the
// supervisor reports lifecycle here and asks requestRestart / findEvictable which consult the pure
// storm/idle policies. The actual spawn/kill/health-probe is the infra seam. Workspace-scoped.

const MAX_HISTORY = 20;

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function registerLocalService(input: {
  workspaceId: string;
  key: string;
  kind?: string;
  command?: string | null;
}): Promise<LocalService> {
  if (!input.key?.trim()) badRequest("service key is required");
  return prisma.localService.upsert({
    where: { workspaceId_key: { workspaceId: input.workspaceId, key: input.key } },
    create: {
      workspaceId: input.workspaceId,
      key: input.key,
      kind: input.kind ?? "local_stdio",
      command: input.command ?? null,
    },
    update: { kind: input.kind ?? "local_stdio", command: input.command ?? null },
  });
}

export function listLocalServices(workspaceId: string, status?: string): Promise<LocalService[]> {
  return prisma.localService.findMany({
    where: { workspaceId, ...(status ? { status } : {}) },
    orderBy: { key: "asc" },
  });
}

/** The supervisor reports a running service healthy/active. */
export async function recordServiceHealth(
  workspaceId: string,
  key: string,
  pid?: number | null,
): Promise<LocalService> {
  const { count } = await prisma.localService.updateMany({
    where: { workspaceId, key },
    data: {
      status: "running",
      pid: pid ?? undefined,
      lastHealthyAt: new Date(),
      lastActivityAt: new Date(),
      lastError: null,
    },
  });
  if (count === 0) badRequest("Service not found");
  return (await prisma.localService.findFirst({ where: { workspaceId, key } }))!;
}

/**
 * Ask whether a crashed service may be restarted (restart-storm suppression). On allow, records the
 * restart (status=starting, appends to history); on suppression, parks it status=suppressed. Returns the
 * decision so the caller knows whether to actually spawn.
 */
export async function requestServiceRestart(
  workspaceId: string,
  key: string,
  opts: { maxRestarts?: number; windowMs?: number } = {},
): Promise<{ decision: RestartDecision; service: LocalService }> {
  const svc = await prisma.localService.findFirst({ where: { workspaceId, key } });
  if (!svc) badRequest("Service not found");
  const history = Array.isArray(svc.restartHistory) ? (svc.restartHistory as number[]) : [];
  const now = Date.now();
  const decision = shouldRestartService(history, now, opts);

  if (!decision.allow) {
    const service = await prisma.localService.update({
      where: { id: svc.id },
      data: { status: "suppressed", lastError: decision.reason },
    });
    return { decision, service };
  }
  const nextHistory = [...history, now].slice(-MAX_HISTORY);
  const service = await prisma.localService.update({
    where: { id: svc.id },
    data: {
      status: "starting",
      restartCount: { increment: 1 },
      restartHistory: nextHistory as never,
    },
  });
  return { decision, service };
}

/** Mark a service crashed (the supervisor observed it exit). */
export async function recordServiceCrash(
  workspaceId: string,
  key: string,
  error?: string | null,
): Promise<void> {
  await prisma.localService.updateMany({
    where: { workspaceId, key },
    data: { status: "crashed", pid: null, lastError: error ?? "process exited" },
  });
}

/** Running services idle longer than `idleMs` — the supervisor's eviction candidates. */
export async function findEvictableServices(
  workspaceId: string,
  idleMs: number,
): Promise<LocalService[]> {
  const running = await prisma.localService.findMany({ where: { workspaceId, status: "running" } });
  const now = Date.now();
  return running.filter((s) => shouldEvictIdle(s.lastActivityAt, now, idleMs));
}

/** Mark a service evicted (the supervisor killed an idle process). */
export async function markServiceEvicted(workspaceId: string, key: string): Promise<void> {
  await prisma.localService.updateMany({
    where: { workspaceId, key },
    data: { status: "evicted", pid: null },
  });
}
