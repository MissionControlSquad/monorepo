import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  enqueuePluginJob,
  claimNextPluginJob,
  completePluginJob,
  failPluginJob,
  reclaimStalePluginJobs,
} from "../../src/server/services/plugin-jobs";
import {
  setPluginState,
  getPluginState,
  listPluginState,
  clearPluginState,
} from "../../src/server/services/plugin-state";
import {
  registerManagedResource,
  listManagedResources,
  releasePluginResources,
} from "../../src/server/services/plugin-managed-resources";
import {
  registerPluginTool,
  resolvePluginTool,
  setPluginToolEnabled,
} from "../../src/server/services/plugin-tools";
import { recordPluginLog, prunePluginLogs } from "../../src/server/services/plugin-logs";

// Parity #105/#111/#112/#113/#117/#118/#119/#120/#125/#127/#128 — plugin runtime data layer.
const WS = "ws_plugrt";
const PLUGIN = "acme";

beforeEach(async () => {
  const where = { where: { workspaceId: WS } };
  await Promise.all([
    prisma.pluginJob.deleteMany(where),
    prisma.pluginKv.deleteMany(where),
    prisma.pluginManagedResource.deleteMany(where),
    prisma.pluginTool.deleteMany(where),
    prisma.pluginLog.deleteMany(where),
  ]);
});

describe("plugin jobs (#111/#112/#113)", () => {
  it("enqueue → claim (leased, race-safe) → complete", async () => {
    const job = await enqueuePluginJob({ workspaceId: WS, pluginId: PLUGIN, jobKey: "sync" });
    const claimed = await claimNextPluginJob(WS, "worker-1");
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);
    // a second worker gets nothing (already claimed)
    expect(await claimNextPluginJob(WS, "worker-2")).toBeNull();
    const done = await completePluginJob(WS, job.id, { ok: true });
    expect(done.status).toBe("done");
  });

  it("failure retries with backoff until maxAttempts, then fails", async () => {
    const job = await enqueuePluginJob({
      workspaceId: WS,
      pluginId: PLUGIN,
      jobKey: "flaky",
      maxAttempts: 2,
    });
    await claimNextPluginJob(WS, "w"); // attempt 1
    const retry = await failPluginJob(WS, job.id, "boom");
    expect(retry.status).toBe("queued");
    expect(retry.scheduledFor.getTime()).toBeGreaterThan(Date.now());

    // force it due again, claim (attempt 2), fail → terminal
    await prisma.pluginJob.update({ where: { id: job.id }, data: { scheduledFor: new Date() } });
    await claimNextPluginJob(WS, "w");
    const dead = await failPluginJob(WS, job.id, "boom again");
    expect(dead.status).toBe("failed");
  });

  it("a cron job re-enqueues its next tick on completion", async () => {
    const job = await enqueuePluginJob({
      workspaceId: WS,
      pluginId: PLUGIN,
      jobKey: "nightly",
      schedule: "0 0 * * *",
    });
    await prisma.pluginJob.update({ where: { id: job.id }, data: { scheduledFor: new Date() } });
    await claimNextPluginJob(WS, "w");
    const after = await completePluginJob(WS, job.id);
    expect(after.status).toBe("queued");
    expect(after.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it("reclaims a stale lease from a dead worker", async () => {
    const job = await enqueuePluginJob({ workspaceId: WS, pluginId: PLUGIN, jobKey: "x" });
    await claimNextPluginJob(WS, "dead");
    await prisma.pluginJob.update({
      where: { id: job.id },
      data: { lockedAt: new Date(Date.now() - 20 * 60_000) },
    });
    expect(await reclaimStalePluginJobs(WS)).toBe(1);
    expect((await prisma.pluginJob.findUnique({ where: { id: job.id } }))?.status).toBe("queued");
  });
});

describe("plugin state KV (#105/#125)", () => {
  it("set/get/list/clear across namespaces", async () => {
    await setPluginState(WS, PLUGIN, "cursor", { page: 2 });
    await setPluginState(WS, PLUGIN, "doc1", { title: "a" }, "db:notes");
    expect(await getPluginState(WS, PLUGIN, "cursor")).toEqual({ page: 2 });
    expect(await getPluginState(WS, PLUGIN, "missing")).toBeNull();
    expect(await listPluginState(WS, PLUGIN)).toHaveLength(1); // default ns only
    expect(await listPluginState(WS, PLUGIN, "db:notes")).toHaveLength(1);
    expect(await clearPluginState(WS, PLUGIN)).toBe(2); // all namespaces
  });
});

describe("plugin managed resources (#118/#119/#120)", () => {
  it("registers ownership and blocks a second plugin claiming the same resource", async () => {
    await registerManagedResource({
      workspaceId: WS,
      pluginId: PLUGIN,
      resourceType: "agent",
      resourceId: "agent-1",
    });
    expect(await listManagedResources(WS, { pluginId: PLUGIN })).toHaveLength(1);
    await expect(
      registerManagedResource({
        workspaceId: WS,
        pluginId: "other",
        resourceType: "agent",
        resourceId: "agent-1",
      }),
    ).rejects.toThrow(/already managed/);
    expect(await releasePluginResources(WS, PLUGIN)).toBe(1);
  });
});

describe("plugin tools (#127/#128)", () => {
  it("register → dispatcher resolves enabled tool → disable hides it", async () => {
    await registerPluginTool({
      workspaceId: WS,
      pluginId: PLUGIN,
      toolName: "acme.search",
      displayName: "Search",
    });
    expect((await resolvePluginTool(WS, "acme.search"))?.pluginId).toBe(PLUGIN);
    await expect(
      registerPluginTool({
        workspaceId: WS,
        pluginId: "other",
        toolName: "acme.search",
        displayName: "X",
      }),
    ).rejects.toThrow(/already registered/);
    await setPluginToolEnabled(WS, "acme.search", false);
    expect(await resolvePluginTool(WS, "acme.search")).toBeNull();
  });
});

describe("plugin logs + retention (#117)", () => {
  it("prunes by age", async () => {
    const old = await recordPluginLog({
      workspaceId: WS,
      pluginId: PLUGIN,
      level: "info",
      message: "old",
    });
    await prisma.pluginLog.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    await recordPluginLog({ workspaceId: WS, pluginId: PLUGIN, level: "info", message: "new" });
    expect(await prunePluginLogs(WS, PLUGIN, { maxAgeDays: 30 })).toBe(1);
    expect(await prisma.pluginLog.count({ where: { workspaceId: WS } })).toBe(1);
  });

  it("rejects an invalid level", async () => {
    await expect(
      recordPluginLog({ workspaceId: WS, pluginId: PLUGIN, level: "bogus", message: "x" }),
    ).rejects.toThrow(/level/);
  });
});
