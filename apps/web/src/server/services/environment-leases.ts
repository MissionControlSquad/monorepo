/**
 * Tier D / Phase 3 (Plan 2) — Environment lease lifecycle: acquire → run → release, with reuse/retain
 * and a reaper. Ported from Paperclip's environment-lease model, adapted to our in-process provider
 * seam. A lease binds a run to a live provider machine and records its reuse policy so the machine can
 * be re-attached (reuse_by_environment), kept for debugging (retain_on_failure), or torn down.
 *
 * Reuse/retain is only ever within the SAME workspace + environment (never cross-tenant machine reuse).
 * Claiming a reusable lease is an atomic compare-and-set (mirrors the runner-command claim) so two
 * concurrent runs never grab the same machine.
 */
import { prisma } from "@/server/prisma";
import type { EnvironmentLease } from "@agentcenter/database";
import type { SandboxHandle, SandboxProvider, SandboxProvisionContext } from "./sandbox/types";
import { getSandboxProvider } from "./sandbox-providers";
import { resolveWorkspaceSecret } from "./secrets";

export const LEASE_POLICIES = ["ephemeral", "reuse_by_environment", "retain_on_failure"] as const;
export type LeasePolicy = (typeof LEASE_POLICIES)[number];

/** How long a released-but-reusable machine stays claimable before the reaper destroys it. */
const REUSE_TTL_MS = 30 * 60_000; // 30 min
/** How long a retained-on-failure machine is kept for debugging before cleanup. */
const RETAIN_TTL_MS = 24 * 60 * 60_000; // 24 h

export function coerceLeasePolicy(value: unknown): LeasePolicy {
  return (LEASE_POLICIES as readonly string[]).includes(value as string)
    ? (value as LeasePolicy)
    : "ephemeral";
}

export interface AcquiredLease {
  handle: SandboxHandle;
  /** The persisted lease row, or null for an ad-hoc (no-environment) ephemeral run. */
  lease: EnvironmentLease | null;
}

/** Atomically claim a released, reusable lease for this environment (compare-and-set on status). */
async function claimReusableLease(
  workspaceId: string,
  environmentId: string,
  runId: string | null,
): Promise<EnvironmentLease | null> {
  const candidate = await prisma.environmentLease.findFirst({
    where: {
      workspaceId,
      environmentId,
      status: "released",
      leasePolicy: "reuse_by_environment",
      providerLeaseId: { not: null },
    },
    orderBy: { lastUsedAt: "desc" },
  });
  if (!candidate) return null;
  const res = await prisma.environmentLease.updateMany({
    where: { id: candidate.id, status: "released" },
    data: { status: "active", runId: runId ?? null, lastUsedAt: new Date() },
  });
  if (res.count !== 1) return null; // lost the race to another run
  return prisma.environmentLease.findUnique({ where: { id: candidate.id } });
}

/**
 * Acquire an execution machine for a run. For a `reuse_by_environment` env whose provider supports
 * resume, first try to re-attach to a released reusable machine; otherwise provision a fresh one and
 * record a lease. With no environmentId (ad-hoc sandboxProvider run) this is a pure ephemeral
 * provision with no lease row — preserving today's behavior.
 */
export async function acquireLease(opts: {
  workspaceId: string;
  environmentId: string | null;
  provider: SandboxProvider;
  ctx: SandboxProvisionContext;
  policy: LeasePolicy;
  taskId?: string | null;
  runId?: string | null;
}): Promise<AcquiredLease> {
  const { workspaceId, environmentId, provider, ctx, policy, taskId, runId } = opts;
  if (!environmentId) {
    return { handle: await provider.provision(ctx), lease: null };
  }

  if (policy === "reuse_by_environment" && provider.resume) {
    const claimed = await claimReusableLease(workspaceId, environmentId, runId ?? null);
    if (claimed?.providerLeaseId) {
      try {
        const handle = await provider.resume(claimed.providerLeaseId, ctx);
        return { handle, lease: claimed };
      } catch {
        // The machine is gone — retire the stale lease and fall through to a fresh provision.
        await prisma.environmentLease.update({
          where: { id: claimed.id },
          data: { status: "expired", cleanupStatus: "success", releasedAt: new Date() },
        });
      }
    }
  }

  const handle = await provider.provision(ctx);
  const lease = await prisma.environmentLease.create({
    data: {
      workspaceId,
      environmentId,
      provider: provider.key,
      providerLeaseId: handle.id,
      status: "active",
      leasePolicy: policy,
      taskId: taskId ?? null,
      runId: runId ?? null,
    },
  });
  return { handle, lease };
}

/**
 * Release a lease after a run. `ephemeral` → destroy the machine. `reuse_by_environment` → keep it,
 * mark released (claimable again) with a reuse TTL. `retain_on_failure` → on failure keep it (status
 * retained, longer TTL); on success destroy it. Ad-hoc runs (lease null) just destroy the handle.
 */
export async function releaseLease(opts: {
  lease: EnvironmentLease | null;
  handle: SandboxHandle;
  outcome: "success" | "failure";
}): Promise<void> {
  const { lease, handle, outcome } = opts;
  if (!lease) {
    await handle.destroy().catch(() => {});
    return;
  }
  const policy = lease.leasePolicy as LeasePolicy;
  const keepReusable = policy === "reuse_by_environment";
  const keepRetained = policy === "retain_on_failure" && outcome === "failure";

  if (keepReusable) {
    await prisma.environmentLease.update({
      where: { id: lease.id },
      data: {
        status: "released",
        lastUsedAt: new Date(),
        releasedAt: new Date(),
        expiresAt: new Date(Date.now() + REUSE_TTL_MS),
      },
    });
    return; // machine kept alive for the next run
  }
  if (keepRetained) {
    await prisma.environmentLease.update({
      where: { id: lease.id },
      data: {
        status: "retained",
        failureReason: "run failed — machine retained for debugging",
        expiresAt: new Date(Date.now() + RETAIN_TTL_MS),
      },
    });
    return;
  }
  // ephemeral, or retain_on_failure with a successful run → tear it down.
  await handle.destroy().catch(() => {});
  await prisma.environmentLease.update({
    where: { id: lease.id },
    data: { status: "released", cleanupStatus: "success", releasedAt: new Date() },
  });
}

function leaseCtx(workspaceId: string): SandboxProvisionContext {
  return { workspaceId, resolveSecret: (name) => resolveWorkspaceSecret(workspaceId, name) };
}

/**
 * Reaper: destroy machines behind leases whose reuse/retain TTL has elapsed. Compare-and-set to
 * `pending_cleanup` first so a live re-claim (which flips a released lease back to active) is never
 * destroyed out from under a running task. Idempotent; safe to run on a cron.
 */
export async function reapStaleLeases(limit = 50): Promise<number> {
  const now = new Date();
  const stale = await prisma.environmentLease.findMany({
    where: { status: { in: ["released", "retained"] }, expiresAt: { lt: now } },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  let reaped = 0;
  for (const lease of stale) {
    // CAS: only reap if still in the status we saw (a re-claim would have flipped it to active).
    const claim = await prisma.environmentLease.updateMany({
      where: { id: lease.id, status: lease.status },
      data: { status: "pending_cleanup" },
    });
    if (claim.count !== 1) continue;

    const provider = getSandboxProvider(lease.provider ?? "");
    try {
      if (provider?.destroyById && lease.providerLeaseId) {
        await provider.destroyById(lease.providerLeaseId, leaseCtx(lease.workspaceId));
      }
      await prisma.environmentLease.update({
        where: { id: lease.id },
        data: { status: "expired", cleanupStatus: "success" },
      });
      reaped++;
    } catch (err) {
      await prisma.environmentLease.update({
        where: { id: lease.id },
        data: {
          status: "expired",
          cleanupStatus: "failed",
          failureReason: String(err).slice(0, 300),
        },
      });
    }
  }
  return reaped;
}

// ── reads + manual controls ─────────────────────────────────────────────────
export function listEnvironmentLeases(workspaceId: string, environmentId?: string | null) {
  return prisma.environmentLease.findMany({
    where: { workspaceId, ...(environmentId ? { environmentId } : {}) },
    orderBy: { acquiredAt: "desc" },
    take: 100,
  });
}

/** Manually destroy a lease's machine now (admin action). Idempotent. */
export async function destroyLeaseNow(workspaceId: string, leaseId: string): Promise<boolean> {
  const lease = await prisma.environmentLease.findFirst({ where: { id: leaseId, workspaceId } });
  if (!lease) return false;
  const provider = getSandboxProvider(lease.provider ?? "");
  try {
    if (provider?.destroyById && lease.providerLeaseId) {
      await provider.destroyById(lease.providerLeaseId, leaseCtx(workspaceId));
    }
  } catch {
    // best-effort; still mark it expired so it stops being reused
  }
  await prisma.environmentLease.update({
    where: { id: lease.id },
    data: { status: "expired", cleanupStatus: "success", releasedAt: new Date() },
  });
  return true;
}
