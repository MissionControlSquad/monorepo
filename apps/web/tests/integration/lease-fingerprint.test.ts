import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { existsSync } from "node:fs";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import { createEnvironment } from "../../src/server/services/environments";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";
import { computeLeaseSecretFingerprint } from "../../src/server/services/environment-leases";
import { createSecret, bindSecret, rotateSecret } from "../../src/server/services/secrets";

// Sandbox security hardening — Item 1 (integration). A reusable lease must NOT be re-attached after a
// secret it depends on is rotated: the secret-version fingerprint changes, so a FRESH machine is
// provisioned with the current credentials instead of reusing the stale one.
const WS = "ws_lease_fp";

beforeAll(() => {
  process.env.SYSTEM_SECRET = "lease-fp-secret";
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE environment_leases, environments, agent_runs, messages, tasks, agents, profiles,
       secret_bindings, secret_versions, secret_access_events, secrets CASCADE`,
  );
  setTestFeature(FLAG_KEYS.RUNNERS, true);
  invalidateFlagCache();
});

async function makeTask(): Promise<string> {
  const t = await prisma.task.create({
    data: { title: "t", description: "d", status: "assigned", priority: "high", tags: [] },
  });
  return t.id;
}
async function agentInEnv(environmentId: string): Promise<string> {
  const a = await prisma.agent.create({
    data: {
      name: "A",
      role: "worker",
      personality: "x",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_leasefp_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: "echo OK",
      environmentId,
    },
  });
  return a.id;
}

describe("lease secret-version fingerprint (Item 1, integration)", () => {
  it("computeLeaseSecretFingerprint CHANGES across a rotation of a bound secret", async () => {
    const env = await createEnvironment(WS, {
      name: "FP",
      driver: "sandbox",
      config: { provider: "local" },
      metadata: { leasePolicy: "reuse_by_environment" },
    });
    const agentId = await agentInEnv(env.id);
    const secret = await createSecret({
      workspaceId: WS,
      name: "API_KEY",
      value: "v1",
      createdBy: "h",
    });
    await bindSecret({
      workspaceId: WS,
      secretId: secret.id,
      scope: "agent",
      agentId,
      envVarName: "API_KEY",
      createdBy: "h",
    });

    const before = await computeLeaseSecretFingerprint({
      workspaceId: WS,
      environmentId: env.id,
      agentId,
    });
    await rotateSecret({ workspaceId: WS, secretId: secret.id, value: "v2", createdBy: "h" });
    const after = await computeLeaseSecretFingerprint({
      workspaceId: WS,
      environmentId: env.id,
      agentId,
    });

    expect(before).not.toBe(after);
    expect(before.startsWith("sf1:")).toBe(true);
  });

  it("reuse_by_environment: a rotated secret forces a FRESH machine (no stale-credential reuse)", async () => {
    const env = await createEnvironment(WS, {
      name: "Reuse",
      driver: "sandbox",
      config: { provider: "local" },
      metadata: { leasePolicy: "reuse_by_environment" },
    });
    const agentId = await agentInEnv(env.id);
    const secret = await createSecret({
      workspaceId: WS,
      name: "API_KEY",
      value: "v1",
      createdBy: "h",
    });
    await bindSecret({
      workspaceId: WS,
      secretId: secret.id,
      scope: "agent",
      agentId,
      envVarName: "API_KEY",
      createdBy: "h",
    });

    // Run 1: provisions + keeps a reusable machine, stamped with the v1 fingerprint.
    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const after1 = await prisma.environmentLease.findMany({ where: { environmentId: env.id } });
    expect(after1).toHaveLength(1);
    expect(after1[0].status).toBe("released"); // kept alive, claimable
    const machine1 = after1[0].providerLeaseId!;
    const fp1 = after1[0].secretFingerprint!;
    expect(fp1).toBeTruthy();

    // Rotate the bound secret → its version bumps → the run's fingerprint changes.
    await rotateSecret({ workspaceId: WS, secretId: secret.id, value: "v2", createdBy: "h" });

    // Run 2: the kept machine's fingerprint no longer matches → NOT reused → a fresh machine is booted.
    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const after2 = await prisma.environmentLease.findMany({
      where: { environmentId: env.id },
      orderBy: { acquiredAt: "asc" },
    });
    expect(after2).toHaveLength(2); // a NEW lease, not a reuse of the first
    const machine2 = after2[1].providerLeaseId!;
    expect(machine2).not.toBe(machine1); // different machine
    expect(after2[1].secretFingerprint).not.toBe(fp1); // stamped with the rotated fingerprint
    expect(existsSync(machine2)).toBe(true);
  });

  it("WITHOUT a rotation the same machine is reused (single lease) — control", async () => {
    const env = await createEnvironment(WS, {
      name: "ReuseCtl",
      driver: "sandbox",
      config: { provider: "local" },
      metadata: { leasePolicy: "reuse_by_environment" },
    });
    const agentId = await agentInEnv(env.id);
    const secret = await createSecret({
      workspaceId: WS,
      name: "API_KEY",
      value: "v1",
      createdBy: "h",
    });
    await bindSecret({
      workspaceId: WS,
      secretId: secret.id,
      scope: "agent",
      agentId,
      envVarName: "API_KEY",
      createdBy: "h",
    });

    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const machine = (await prisma.environmentLease.findFirst({ where: { environmentId: env.id } }))!
      .providerLeaseId!;
    await runTaskInSandbox({ workspaceId: WS, taskId: await makeTask(), agentId });
    const leases = await prisma.environmentLease.findMany({ where: { environmentId: env.id } });
    expect(leases).toHaveLength(1); // reused, no new lease
    expect(leases[0].providerLeaseId).toBe(machine);
  });
});
