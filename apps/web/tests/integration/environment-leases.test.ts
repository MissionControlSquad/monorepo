import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { createEnvironment } from "../../src/server/services/environments";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";
import {
  reapStaleLeases,
  destroyLeaseNow,
  acquireLease,
  releaseLease,
} from "../../src/server/services/environment-leases";
import { getSandboxProvider } from "../../src/server/services/sandbox-providers";

const WS = "ws_leases";

beforeAll(() => {
  process.env.SYSTEM_SECRET = "leases-secret";
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE environment_leases, environments, agent_runs, messages, tasks, agents, profiles CASCADE`,
  );
  await prisma.featureFlag.upsert({
    where: { key: "runners" },
    create: { key: "runners", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
});

async function makeTask(): Promise<string> {
  const t = await prisma.task.create({
    data: { title: "t", description: "d", status: "assigned", priority: "high", tags: [] },
  });
  return t.id;
}
async function agentInEnv(environmentId: string, template = "echo OK"): Promise<string> {
  const a = await prisma.agent.create({
    data: {
      name: "A",
      role: "worker",
      personality: "x",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_lease_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: template,
      environmentId,
    },
  });
  return a.id;
}

describe("environment leases", () => {
  it("reuse_by_environment: two runs re-attach to the SAME machine (one lease)", async () => {
    const env = await createEnvironment(WS, {
      name: "Reuse",
      driver: "sandbox",
      config: { provider: "local" },
      metadata: { leasePolicy: "reuse_by_environment" },
    });
    const agentId = await agentInEnv(env.id);

    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const after1 = await prisma.environmentLease.findMany({ where: { environmentId: env.id } });
    expect(after1).toHaveLength(1);
    expect(after1[0].status).toBe("released"); // kept alive, claimable
    const machine = after1[0].providerLeaseId!;
    expect(existsSync(machine)).toBe(true); // NOT destroyed

    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const after2 = await prisma.environmentLease.findMany({ where: { environmentId: env.id } });
    expect(after2).toHaveLength(1); // reused, not a new lease
    expect(after2[0].providerLeaseId).toBe(machine); // same machine
  });

  it("ephemeral: the machine is destroyed after the run", async () => {
    const env = await createEnvironment(WS, {
      name: "Eph",
      driver: "sandbox",
      config: { provider: "local" },
      // no leasePolicy → ephemeral
    });
    const agentId = await agentInEnv(env.id);
    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const lease = (await prisma.environmentLease.findFirst({ where: { environmentId: env.id } }))!;
    expect(lease.status).toBe("released");
    expect(lease.cleanupStatus).toBe("success");
    expect(existsSync(lease.providerLeaseId!)).toBe(false); // torn down
  });

  it("retain_on_failure: a failing run keeps the machine (retained)", async () => {
    const env = await createEnvironment(WS, {
      name: "Retain",
      driver: "sandbox",
      config: { provider: "local" },
      metadata: { leasePolicy: "retain_on_failure" },
    });
    const agentId = await agentInEnv(env.id, "exit 3"); // non-zero exit → failure
    const result = await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    expect(result.exitCode).not.toBe(0);
    const lease = (await prisma.environmentLease.findFirst({ where: { environmentId: env.id } }))!;
    expect(lease.status).toBe("retained");
    expect(existsSync(lease.providerLeaseId!)).toBe(true); // kept for debugging
  });

  it("reaper destroys a released reusable lease past its TTL", async () => {
    const env = await createEnvironment(WS, {
      name: "Reap",
      driver: "sandbox",
      config: { provider: "local" },
      metadata: { leasePolicy: "reuse_by_environment" },
    });
    const agentId = await agentInEnv(env.id);
    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const lease = (await prisma.environmentLease.findFirst({ where: { environmentId: env.id } }))!;
    const dir = lease.providerLeaseId!;
    expect(existsSync(dir)).toBe(true);

    // Age the lease past its reuse TTL, then reap.
    await prisma.environmentLease.update({
      where: { id: lease.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const reaped = await reapStaleLeases();
    expect(reaped).toBeGreaterThanOrEqual(1);
    const after = (await prisma.environmentLease.findUnique({ where: { id: lease.id } }))!;
    expect(after.status).toBe("expired");
    expect(existsSync(dir)).toBe(false); // machine destroyed
  });

  it("concurrent acquire on a reusable env yields exactly one reuse (atomic claim)", async () => {
    const env = await createEnvironment(WS, {
      name: "Race",
      driver: "sandbox",
      config: { provider: "local" },
      metadata: { leasePolicy: "reuse_by_environment" },
    });
    const provider = getSandboxProvider("local")!;
    const ctx = { workspaceId: WS, resolveSecret: async () => null };

    // Seed one released reusable lease (a machine kept from a prior run).
    const first = await acquireLease({
      workspaceId: WS,
      environmentId: env.id,
      provider,
      ctx,
      policy: "reuse_by_environment",
    });
    await releaseLease({ lease: first.lease, handle: first.handle, outcome: "success" });

    // Two concurrent acquires: exactly one re-attaches to the kept machine, the other provisions fresh.
    const [a, b] = await Promise.all([
      acquireLease({
        workspaceId: WS,
        environmentId: env.id,
        provider,
        ctx,
        policy: "reuse_by_environment",
      }),
      acquireLease({
        workspaceId: WS,
        environmentId: env.id,
        provider,
        ctx,
        policy: "reuse_by_environment",
      }),
    ]);
    const ids = [a.handle.id, b.handle.id];
    // one of them reused first.handle.id; the other is a brand-new dir
    const reusedCount = ids.filter((id) => id === first.handle.id).length;
    expect(reusedCount).toBe(1);
    expect(new Set(ids).size).toBe(2); // two distinct machines now live

    // total leases: the seed (now active again) + one fresh = 2 (never 3 → no double-reuse)
    const active = await prisma.environmentLease.count({
      where: { environmentId: env.id, status: "active" },
    });
    expect(active).toBe(2);

    await releaseLease({ lease: a.lease, handle: a.handle, outcome: "success" });
    await releaseLease({ lease: b.lease, handle: b.handle, outcome: "success" });
  });

  it("destroyLeaseNow tears a machine down and marks the lease expired", async () => {
    const env = await createEnvironment(WS, {
      name: "Manual",
      driver: "sandbox",
      config: { provider: "local" },
      metadata: { leasePolicy: "reuse_by_environment" },
    });
    const agentId = await agentInEnv(env.id);
    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const lease = (await prisma.environmentLease.findFirst({ where: { environmentId: env.id } }))!;
    expect(await destroyLeaseNow(WS, lease.id)).toBe(true);
    const after = (await prisma.environmentLease.findUnique({ where: { id: lease.id } }))!;
    expect(after.status).toBe("expired");
    expect(existsSync(lease.providerLeaseId!)).toBe(false);
  });
});
