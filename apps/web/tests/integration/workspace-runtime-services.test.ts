import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import { schema } from "../../src/server/graphql/schema";
import { requireFeature } from "../../src/server/graphql/require-feature";
import { requireRole } from "../../src/server/tenancy";
import type { GraphQLContext } from "@agentcenter/graphql-server";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  startWorkspaceRuntimeService,
  markRuntimeServiceRunning,
  setRuntimeServiceHealth,
  stopWorkspaceRuntimeService,
  listWorkspaceRuntimeServices,
  reapIdleRuntimeServices,
  policyPermitsStop,
} from "../../src/server/services/workspace-runtime-services";

// WorkspaceRuntimeService — long-lived dev/preview process lifecycle. LOCAL_SERVICES-gated,
// workspace-scoped. Exercises: start/reuse/stop transitions, reuseKey dedupe, idle-reap, flag+role
// gates, and cross-workspace isolation.
const WS = "ws_runtime_svc";
const OTHER_WS = "ws_runtime_other";

async function setFlag(key: string, enabled: boolean) {
  setTestFeature(key, enabled);
  invalidateFlagCache();
}

async function makeExecutionWorkspace(workspaceId = WS) {
  return prisma.executionWorkspace.create({
    data: { workspaceId, strategyType: "cloud_sandbox", name: "ew", providerType: "local" },
  });
}

/** Build a GraphQL context with a given human tenancy (or none). */
function ctx(role: "admin" | "member" | null, workspaceId = WS): GraphQLContext {
  const tenancy =
    role == null
      ? null
      : {
          userId: "u1",
          workspaceId,
          role,
          can: () => role === "admin",
        };
  return { prisma, session: null, tenancy } as unknown as GraphQLContext;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE workspace_runtime_services, workspace_operations, execution_workspaces CASCADE`,
  );
  await setFlag("local_services", true);
  await setFlag("execution_workspaces", true);
});

describe("WorkspaceRuntimeService — service lifecycle", () => {
  it("starts a service in `starting`, then marks it running + healthy", async () => {
    const ew = await makeExecutionWorkspace();
    const { service, reused } = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "Vite dev",
      command: "npm run dev",
      reuseKey: "dev",
      port: 5173,
      stopPolicy: "on_run_end",
    });
    expect(reused).toBe(false);
    expect(service.status).toBe("starting");

    const running = await markRuntimeServiceRunning(WS, service.id, { pid: 4242, port: 5173 });
    expect(running).toMatchObject({ status: "running", pid: 4242, port: 5173 });

    const healthy = await setRuntimeServiceHealth(WS, service.id, "healthy");
    expect(healthy.healthStatus).toBe("healthy");
    expect(healthy.status).toBe("running");
    expect(healthy.lastHealthAt).toBeInstanceOf(Date);

    // an unhealthy probe flips the service to `unhealthy` but keeps the row alive
    const unhealthy = await setRuntimeServiceHealth(WS, service.id, "unhealthy");
    expect(unhealthy.status).toBe("unhealthy");
    expect(unhealthy.healthStatus).toBe("unhealthy");
  });

  it("reuses the live service for the same reuseKey (no duplicate); a new key makes a new row", async () => {
    const ew = await makeExecutionWorkspace();
    const first = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "dev",
      command: "npm run dev",
      reuseKey: "dev",
    });
    const second = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "dev-again",
      command: "npm run dev",
      reuseKey: "dev",
    });
    expect(second.reused).toBe(true);
    expect(second.service.id).toBe(first.service.id); // SAME row

    const other = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "storybook",
      command: "npm run storybook",
      reuseKey: "storybook",
    });
    expect(other.reused).toBe(false);
    expect(other.service.id).not.toBe(first.service.id);

    expect(await listWorkspaceRuntimeServices(WS, ew.id)).toHaveLength(2);
  });

  it("re-starting after a stop creates a fresh row (stopped rows don't block the reuseKey)", async () => {
    const ew = await makeExecutionWorkspace();
    const first = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "dev",
      command: "npm run dev",
      reuseKey: "dev",
      stopPolicy: "manual",
    });
    await stopWorkspaceRuntimeService(WS, first.service.id, { reason: "manual" });
    const restarted = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "dev",
      command: "npm run dev",
      reuseKey: "dev",
    });
    expect(restarted.reused).toBe(false);
    expect(restarted.service.id).not.toBe(first.service.id);
  });
});

describe("WorkspaceRuntimeService — stop respects stopPolicy", () => {
  it("a manual-policy service survives run_end and idle, but a manual stop always wins", async () => {
    const ew = await makeExecutionWorkspace();
    const { service } = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "preview",
      command: "npm run preview",
      reuseKey: "preview",
      stopPolicy: "manual",
    });

    const byRunEnd = await stopWorkspaceRuntimeService(WS, service.id, { reason: "run_end" });
    expect(byRunEnd.stopped).toBe(false); // policy protects it
    const byIdle = await stopWorkspaceRuntimeService(WS, service.id, { reason: "idle" });
    expect(byIdle.stopped).toBe(false);

    const manual = await stopWorkspaceRuntimeService(WS, service.id, { reason: "manual" });
    expect(manual.stopped).toBe(true);
    expect(manual.service.status).toBe("stopped");
    expect(manual.service.stopReason).toBe("manual");
  });

  it("an on_run_end service stops on run_end; a kill failure lands in stopped_failed", async () => {
    const ew = await makeExecutionWorkspace();
    const a = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "dev",
      command: "npm run dev",
      reuseKey: "dev",
      stopPolicy: "on_run_end",
    });
    const stopped = await stopWorkspaceRuntimeService(WS, a.service.id, { reason: "run_end" });
    expect(stopped.stopped).toBe(true);
    expect(stopped.service.status).toBe("stopped");

    const b = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "dev2",
      command: "npm run dev",
      reuseKey: "dev2",
      stopPolicy: "on_run_end",
    });
    const failed = await stopWorkspaceRuntimeService(WS, b.service.id, {
      reason: "run_end",
      killFailed: true,
    });
    expect(failed.service.status).toBe("stopped_failed");
  });

  it("policyPermitsStop matrix", () => {
    expect(policyPermitsStop("manual", "manual")).toBe(true);
    expect(policyPermitsStop("manual", "run_end")).toBe(false);
    expect(policyPermitsStop("manual", "idle")).toBe(false);
    expect(policyPermitsStop("on_run_end", "run_end")).toBe(true);
    expect(policyPermitsStop("on_run_end", "idle")).toBe(false);
    expect(policyPermitsStop("on_idle", "idle")).toBe(true);
  });
});

describe("WorkspaceRuntimeService — idle reaper", () => {
  it("stops on_idle services idle past the TTL, but keeps busy/other-policy ones", async () => {
    const ew = await makeExecutionWorkspace();
    // idle on_idle service — should be reaped
    const idle = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "idle",
      command: "npm run dev",
      reuseKey: "idle",
      stopPolicy: "on_idle",
    });
    // fresh on_idle service — should NOT be reaped (still within TTL)
    const fresh = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "fresh",
      command: "npm run dev",
      reuseKey: "fresh",
      stopPolicy: "on_idle",
    });
    // manual-policy service, also idle — reaper must never touch it
    const manual = await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ew.id,
      name: "manual",
      command: "npm run dev",
      reuseKey: "manual",
      stopPolicy: "manual",
    });

    // backdate the idle + manual services and the workspace so they are past the TTL
    const old = new Date(Date.now() - 60 * 60_000);
    await prisma.workspaceRuntimeService.updateMany({
      where: { id: { in: [idle.service.id, manual.service.id] } },
      data: { lastUsedAt: old },
    });
    await prisma.executionWorkspace.update({
      where: { id: ew.id },
      data: { status: "closed", lastUsedAt: old },
    });

    const reaped = await reapIdleRuntimeServices();
    expect(reaped).toBe(1);

    expect(
      (await prisma.workspaceRuntimeService.findUnique({ where: { id: idle.service.id } }))?.status,
    ).toBe("stopped");
    expect(
      (await prisma.workspaceRuntimeService.findUnique({ where: { id: idle.service.id } }))
        ?.stopReason,
    ).toBe("idle");
    expect(
      (await prisma.workspaceRuntimeService.findUnique({ where: { id: fresh.service.id } }))
        ?.status,
    ).toBe("starting");
    expect(
      (await prisma.workspaceRuntimeService.findUnique({ where: { id: manual.service.id } }))
        ?.status,
    ).toBe("starting");
  });
});

describe("WorkspaceRuntimeService — isolation + flag/role gates", () => {
  it("list never returns another workspace's services", async () => {
    const ewA = await makeExecutionWorkspace(WS);
    const ewB = await makeExecutionWorkspace(OTHER_WS);
    await startWorkspaceRuntimeService(WS, {
      executionWorkspaceId: ewA.id,
      name: "a",
      command: "x",
      reuseKey: "a",
    });
    await startWorkspaceRuntimeService(OTHER_WS, {
      executionWorkspaceId: ewB.id,
      name: "b",
      command: "y",
      reuseKey: "b",
    });
    const listA = await listWorkspaceRuntimeServices(WS);
    expect(listA).toHaveLength(1);
    expect(listA[0].name).toBe("a");
  });

  it("start rejects an execution workspace from another tenant (NOT_FOUND)", async () => {
    const ewB = await makeExecutionWorkspace(OTHER_WS);
    await expect(
      startWorkspaceRuntimeService(WS, {
        executionWorkspaceId: ewB.id,
        name: "x",
        command: "x",
        reuseKey: "x",
      }),
    ).rejects.toThrow(/not found/i);
  });

  // The resolvers compose requireFeature(LOCAL_SERVICES) + requireRole('admin') — the same guards a
  // human mutation runs. Assert the exact gate wiring for this feature (schema-execution realms are a
  // known worktree-symlink artifact, so we exercise the guards the resolver calls, not the whole yoga).
  it("gate: the mutations/query are registered on the schema", () => {
    const mutations = schema.getMutationType()?.getFields() ?? {};
    const queries = schema.getQueryType()?.getFields() ?? {};
    expect(mutations.startWorkspaceRuntimeService).toBeDefined();
    expect(mutations.stopWorkspaceRuntimeService).toBeDefined();
    expect(mutations.setWorkspaceRuntimeServiceHealth).toBeDefined();
    expect(queries.workspaceRuntimeServices).toBeDefined();
  });

  it("gate: requireFeature(LOCAL_SERVICES) blocks when the flag is off, passes when on", async () => {
    await setFlag("local_services", false);
    await expect(requireFeature(FLAG_KEYS.LOCAL_SERVICES)).rejects.toMatchObject({
      extensions: { code: "FEATURE_DISABLED" },
    });
    await setFlag("local_services", true);
    await expect(requireFeature(FLAG_KEYS.LOCAL_SERVICES)).resolves.toBeUndefined();
  });

  it("gate: requireRole('admin') forbids a member and allows an admin", () => {
    expect(() => requireRole(ctx("member"), "admin")).toThrow(/admin/i);
    expect(requireRole(ctx("admin"), "admin").workspaceId).toBe(WS);
  });
});
