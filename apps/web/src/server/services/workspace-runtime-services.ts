/**
 * Tier D / Phase 3 — WorkspaceRuntimeService lifecycle (long-lived dev/preview processes).
 *
 * A WorkspaceRuntimeService models a long-lived process started INSIDE an ExecutionWorkspace — e.g.
 * `npm run dev`, a Vite/Next preview server, a mock API — kept alive across runs rather than re-spawned
 * per command. It is tracked by port/health/reuseKey/stopPolicy so it can be reused, health-checked, and
 * reaped. Ported from Paperclip's WorkspaceRuntimeService, adapted to our serverless control plane.
 *
 * ─── WHAT IS MODELLED vs WHAT IS EXECUTED ────────────────────────────────────────────────────────────
 * MODELLED here (the control plane, this file): the row + every lifecycle transition —
 *   start (create-or-reuse → `starting`) · markRunning · setHealth · stop (respecting stopPolicy) ·
 *   list · reapIdleRuntimeServices. Reuse-by-reuseKey, idle reaping, and health are real and tested.
 * EXECUTED elsewhere (the runner/local-driver seam — NOT in this serverless process):
 *   the actual OS process. A runner/local driver would, on `startWorkspaceRuntimeService`:
 *     1. exec `command` in the execution workspace's cwd (e.g. `npm run dev`), capture its `pid`;
 *     2. wait for `port` to bind, then POST `markRunning` (pid/port/providerRef) back to the control
 *        plane (or call the runtime-service health bridge route);
 *     3. periodically probe `healthCheckUrl` and POST `setWorkspaceRuntimeServiceHealth`
 *        (healthy/unhealthy) — the runner→control-plane callback;
 *     4. on stop, SIGTERM the pid (→ SIGKILL) and report; a kill failure is surfaced as
 *        `stopped_failed`.
 * The seam is intentionally not wired to a live process here (serverless): we own the model + the
 * control surface + the transitions; a runner owns the spawn. `providerRef`/`pid` are the handle a
 * runner would fill in.
 *
 * ─── HOW TO TEST (mirrors the integration suite) ─────────────────────────────────────────────────────
 *   1. startWorkspaceRuntimeService(ws, { executionWorkspaceId, name, command:"npm run dev",
 *        reuseKey:"dev", port:5173 }) → a row in status `starting`.
 *   2. markRuntimeServiceRunning(ws, id, { pid:4242, port:5173 }) → `running`.
 *      setRuntimeServiceHealth(ws, id, "healthy") → healthStatus `healthy`, lastHealthAt set.
 *   3. start again with the SAME reuseKey → returns the SAME row (reuse, no duplicate) and bumps
 *      lastUsedAt; a DIFFERENT reuseKey → a new row.
 *   4. stopWorkspaceRuntimeService(ws, id, { reason:"run_end" }) respects stopPolicy: a `manual`-policy
 *      service is NOT stopped by run_end/idle, only by reason `manual`; `on_run_end`/`on_idle` stop.
 *   5. backdate lastUsedAt and reapIdleRuntimeServices() → stops the `on_idle` service (reason `idle`).
 *
 * D5: every finder + mutation is workspace-scoped. LOCAL_SERVICES-flag-gated at the resolver seam.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { WorkspaceRuntimeService } from "@agentcenter/database";
import { recordWorkspaceOperation } from "./execution-workspaces";
import { badRequest } from "./service-errors";

// ── status / policy vocabularies (TEXT — D5) ─────────────────────────────────
export const RUNTIME_SERVICE_STATUSES = [
  "stopped",
  "starting",
  "running",
  "unhealthy",
  "stopped_failed",
] as const;
export type RuntimeServiceStatus = (typeof RUNTIME_SERVICE_STATUSES)[number];

export const STOP_POLICIES = ["on_idle", "on_run_end", "manual"] as const;
export type StopPolicy = (typeof STOP_POLICIES)[number];

/** Reasons a stop can be triggered. Only `manual` overrides a `manual` stopPolicy. */
export const STOP_REASONS = ["manual", "run_end", "idle", "failed"] as const;
export type StopReason = (typeof STOP_REASONS)[number];

/** Statuses that count as LIVE (a running/starting service). Stopped rows never conflict on reuseKey. */
const LIVE_STATUSES: RuntimeServiceStatus[] = ["starting", "running", "unhealthy"];

/** How long a running `on_idle` service may sit unused before the reaper stops it. */
export const IDLE_TTL_MS = 30 * 60_000; // 30 min

export function coerceStopPolicy(value: unknown): StopPolicy {
  return (STOP_POLICIES as readonly string[]).includes(value as string)
    ? (value as StopPolicy)
    : "on_run_end";
}

// ── start / reuse ────────────────────────────────────────────────────────────
export interface StartRuntimeServiceInput {
  executionWorkspaceId: string;
  name: string;
  command: string;
  reuseKey: string;
  port?: number | null;
  healthCheckUrl?: string | null;
  stopPolicy?: string | null;
}

/**
 * Start a runtime service, or REUSE the live one already registered for the same
 * (executionWorkspaceId, reuseKey). Reuse is idempotent: it returns the existing row (bumping
 * lastUsedAt) instead of spawning a duplicate dev server. A brand-new service is created in status
 * `starting` — the runner then execs `command` and reports `markRuntimeServiceRunning`.
 *
 * The execution workspace must belong to the caller's workspace (isolation).
 */
export async function startWorkspaceRuntimeService(
  workspaceId: string,
  input: StartRuntimeServiceInput,
): Promise<{ service: WorkspaceRuntimeService; reused: boolean }> {
  const name = input.name?.trim();
  const command = input.command?.trim();
  const reuseKey = input.reuseKey?.trim();
  if (!name) badRequest("name is required");
  if (!command) badRequest("command is required");
  if (!reuseKey) badRequest("reuseKey is required");
  if (input.stopPolicy && !(STOP_POLICIES as readonly string[]).includes(input.stopPolicy)) {
    badRequest(`Unknown stopPolicy: ${input.stopPolicy}`);
  }
  if (input.port != null && (input.port < 1 || input.port > 65535)) {
    badRequest("port must be between 1 and 65535");
  }

  const ew = await prisma.executionWorkspace.findFirst({
    where: { id: input.executionWorkspaceId, workspaceId },
    select: { id: true },
  });
  if (!ew) {
    throw new GraphQLError("Execution workspace not found", { extensions: { code: "NOT_FOUND" } });
  }

  // Reuse the live service for this reuseKey, if any (dedupe across runs).
  const existing = await prisma.workspaceRuntimeService.findFirst({
    where: {
      workspaceId,
      executionWorkspaceId: input.executionWorkspaceId,
      reuseKey,
      status: { in: LIVE_STATUSES },
    },
    orderBy: { lastUsedAt: "desc" },
  });
  if (existing) {
    const service = await prisma.workspaceRuntimeService.update({
      where: { id: existing.id },
      data: { lastUsedAt: new Date() },
    });
    await logOp(
      input.executionWorkspaceId,
      command,
      "skipped",
      `reuse ${reuseKey} → ${service.id}`,
    );
    return { service, reused: true };
  }

  const service = await prisma.workspaceRuntimeService.create({
    data: {
      workspaceId,
      executionWorkspaceId: input.executionWorkspaceId,
      name,
      command,
      reuseKey,
      port: input.port ?? null,
      healthCheckUrl: input.healthCheckUrl ?? null,
      healthStatus: "unknown",
      stopPolicy: coerceStopPolicy(input.stopPolicy),
      status: "starting",
      startedAt: new Date(),
      lastUsedAt: new Date(),
    },
  });
  // SEAM: a runner would now exec `command` and, once the port binds, call markRuntimeServiceRunning.
  await logOp(
    input.executionWorkspaceId,
    command,
    "done",
    `start ${name} (${reuseKey}) → starting`,
  );
  return { service, reused: false };
}

// ── runner-reported transitions ──────────────────────────────────────────────
/** The runner reports the process is up (port bound). starting → running. */
export async function markRuntimeServiceRunning(
  workspaceId: string,
  id: string,
  opts: { pid?: number | null; port?: number | null; providerRef?: string | null } = {},
): Promise<WorkspaceRuntimeService> {
  const svc = await requireService(workspaceId, id);
  return prisma.workspaceRuntimeService.update({
    where: { id: svc.id },
    data: {
      status: "running",
      pid: opts.pid ?? undefined,
      port: opts.port ?? undefined,
      providerRef: opts.providerRef ?? undefined,
      lastUsedAt: new Date(),
    },
  });
}

/**
 * The runner/health-bridge reports a probe result against `healthCheckUrl`. A `healthy` probe keeps
 * (or restores) the service `running`; an `unhealthy` probe flips it to `unhealthy` (still alive, but
 * failing its check — an operator/reaper can then stop it). Bumps lastUsedAt so a healthy service is
 * never idle-reaped out from under active traffic.
 */
export async function setRuntimeServiceHealth(
  workspaceId: string,
  id: string,
  health: "healthy" | "unhealthy",
): Promise<WorkspaceRuntimeService> {
  if (health !== "healthy" && health !== "unhealthy")
    badRequest("health must be healthy|unhealthy");
  const svc = await requireService(workspaceId, id);
  // A stopped service never comes back to life via a stray health ping (fail-closed).
  if (svc.status === "stopped" || svc.status === "stopped_failed") {
    badRequest("Cannot set health on a stopped service");
  }
  return prisma.workspaceRuntimeService.update({
    where: { id: svc.id },
    data: {
      healthStatus: health,
      status: health === "healthy" ? "running" : "unhealthy",
      lastHealthAt: new Date(),
      lastUsedAt: new Date(),
    },
  });
}

// ── stop (respecting stopPolicy) ─────────────────────────────────────────────
/**
 * Stop a runtime service, RESPECTING its stopPolicy. The `reason` says who is asking:
 *   - `manual`   → an explicit operator stop; ALWAYS honoured, whatever the policy.
 *   - `run_end`  → the run that started it ended; honoured only for stopPolicy `on_run_end`.
 *   - `idle`     → the reaper found it idle; honoured only for stopPolicy `on_idle`.
 * When the policy does not permit the reason, the call is a no-op (returns { stopped:false }) — e.g. a
 * `manual`-policy preview server survives run_end and idle sweeps until someone stops it by hand.
 *
 * A stop transitions LIVE → `stopped`. `providerRef`/`pid` are cleared (the runner has killed the
 * process). If a caller signals the process kill itself failed (`killFailed`), the service lands in
 * `stopped_failed` so it is visibly stuck rather than silently gone.
 */
export async function stopWorkspaceRuntimeService(
  workspaceId: string,
  id: string,
  opts: { reason?: StopReason; killFailed?: boolean } = {},
): Promise<{ service: WorkspaceRuntimeService; stopped: boolean }> {
  const reason: StopReason = opts.reason ?? "manual";
  const svc = await requireService(workspaceId, id);

  if (svc.status === "stopped" || svc.status === "stopped_failed") {
    return { service: svc, stopped: false }; // already down — idempotent
  }
  if (!policyPermitsStop(svc.stopPolicy, reason)) {
    return { service: svc, stopped: false }; // policy protects it from this reason
  }

  // SEAM: a runner would SIGTERM (→SIGKILL) svc.pid here; `killFailed` reflects that outcome.
  const service = await prisma.workspaceRuntimeService.update({
    where: { id: svc.id },
    data: {
      status: opts.killFailed ? "stopped_failed" : "stopped",
      stopReason: reason,
      stoppedAt: new Date(),
      pid: null,
      providerRef: null,
      healthStatus: null,
    },
  });
  await logOp(
    svc.executionWorkspaceId,
    svc.command,
    opts.killFailed ? "failed" : "done",
    `stop ${svc.name} (${reason})${opts.killFailed ? " — kill failed" : ""}`,
  );
  return { service, stopped: true };
}

/** Does `stopPolicy` allow a stop triggered by `reason`? `manual` reason always wins. */
export function policyPermitsStop(stopPolicy: string, reason: StopReason): boolean {
  if (reason === "manual") return true;
  if (reason === "run_end") return stopPolicy === "on_run_end";
  if (reason === "idle") return stopPolicy === "on_idle";
  if (reason === "failed") return true;
  return false;
}

// ── reads ────────────────────────────────────────────────────────────────────
/**
 * List runtime services, optionally for one execution workspace. Always workspace-scoped so it can
 * never surface another tenant's rows. Newest-first.
 */
export function listWorkspaceRuntimeServices(
  workspaceId: string,
  executionWorkspaceId?: string | null,
): Promise<WorkspaceRuntimeService[]> {
  return prisma.workspaceRuntimeService.findMany({
    where: {
      workspaceId,
      ...(executionWorkspaceId ? { executionWorkspaceId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// ── idle reaper (called from the reap-stale-work cron) ───────────────────────
/**
 * Stop `on_idle` runtime services whose execution workspace has gone idle — no live run, and unused
 * past the TTL. Compare-and-set on status so a service that just took traffic (its lastUsedAt bumped)
 * is never stopped out from under active work. Idempotent; safe on a cron.
 *
 * "workspace has no active run" is derived from the ExecutionWorkspace: a `closed` execution workspace,
 * or one whose lastUsedAt is itself past the TTL, has no live run. Combined with the per-service idle
 * TTL this is the reap condition.
 */
export async function reapIdleRuntimeServices(
  now: Date = new Date(),
  ttlMs: number = IDLE_TTL_MS,
  limit = 50,
): Promise<number> {
  const cutoff = new Date(now.getTime() - ttlMs);
  const candidates = await prisma.workspaceRuntimeService.findMany({
    where: {
      stopPolicy: "on_idle",
      status: { in: LIVE_STATUSES },
      lastUsedAt: { lt: cutoff },
    },
    orderBy: { lastUsedAt: "asc" },
    take: limit,
    include: { executionWorkspace: { select: { status: true, lastUsedAt: true } } },
  });

  let reaped = 0;
  for (const svc of candidates) {
    // The workspace still has active work if it is open AND was itself used within the TTL.
    const ew = svc.executionWorkspace;
    const workspaceBusy = ew.status === "active" && ew.lastUsedAt >= cutoff;
    if (workspaceBusy) continue;

    // CAS: only reap if still in the status we observed (a re-claim would have bumped it).
    const claim = await prisma.workspaceRuntimeService.updateMany({
      where: { id: svc.id, status: svc.status, lastUsedAt: svc.lastUsedAt },
      data: {
        status: "stopped",
        stopReason: "idle",
        stoppedAt: now,
        pid: null,
        providerRef: null,
        healthStatus: null,
      },
    });
    if (claim.count !== 1) continue;
    await logOp(svc.executionWorkspaceId, svc.command, "done", `idle-reap ${svc.name}`);
    reaped++;
  }
  return reaped;
}

// ── helpers ──────────────────────────────────────────────────────────────────
async function requireService(workspaceId: string, id: string): Promise<WorkspaceRuntimeService> {
  const svc = await prisma.workspaceRuntimeService.findFirst({ where: { id, workspaceId } });
  if (!svc) {
    throw new GraphQLError("Runtime service not found", { extensions: { code: "NOT_FOUND" } });
  }
  return svc;
}

/**
 * Emit a WorkspaceOperation phase-log entry (reuses the execution-workspace phase log that already
 * exists). Best-effort — a logging failure never blocks a lifecycle transition.
 */
async function logOp(
  executionWorkspaceId: string,
  command: string,
  status: "done" | "failed" | "skipped",
  detail: string,
): Promise<void> {
  await recordWorkspaceOperation(executionWorkspaceId, "runtime_service", {
    command,
    status,
    detail,
  }).catch(() => {});
}
