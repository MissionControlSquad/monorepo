import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../src/server/prisma";
import { installPlugin } from "../../src/server/services/plugins";
import { registerPluginTool } from "../../src/server/services/plugin-tools";
import { enqueuePluginJob } from "../../src/server/services/plugin-jobs";
import {
  grantPluginCapability,
  revokePluginCapability,
  listPluginGrants,
  resolveGrantedForPlugin,
  assertPluginCapability,
  PluginCapabilityDeniedError,
} from "../../src/server/services/plugin-grants";
import {
  dispatchPluginTool,
  drainDuePluginJob,
  registerPluginEntrypoint,
  unregisterPluginEntrypoint,
} from "../../src/server/services/plugin-runtime";
import { ForkPluginWorkerManager } from "../../src/server/services/plugin-worker-manager";

// Parity #103/#127/#129 — capability enforcement (fail-closed) wired into REAL tool dispatch + job
// execution against a forked worker running the in-repo example plugin.
//
// HOW TO TEST:
//   • grant/revoke:  grantPluginCapability / revokePluginCapability (admin GraphQL wraps these)
//   • ungranted = refused:  dispatchPluginTool / runPluginJobInWorker throw PluginCapabilityDeniedError
//   • granted = succeeds:  the same calls return the worker result
//   Run: npx vitest run tests/integration/plugin-capability-runtime.test.ts

const WS = "ws_plugcap";
const PLUGIN = "example-cap";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.join(DIR, "../fixtures/example-plugin.mjs");

const MANIFEST = {
  apiVersion: 1,
  id: PLUGIN,
  version: "1.0.0",
  displayName: "Example Cap Plugin",
  category: "automation",
  capabilities: ["agent.tools.register", "jobs.schedule"],
  tools: [{ name: "echo", displayName: "Echo", description: "echoes args" }],
  jobs: [{ jobKey: "sync", displayName: "Sync" }],
};

let mgr: ForkPluginWorkerManager;

beforeEach(async () => {
  const where = { where: { workspaceId: WS } };
  await Promise.all([
    prisma.pluginGrant.deleteMany(where),
    prisma.pluginTool.deleteMany(where),
    prisma.pluginJob.deleteMany(where),
    prisma.plugin.deleteMany(where),
  ]);
  await installPlugin(WS, MANIFEST, "profile-admin");
  await registerPluginTool({
    workspaceId: WS,
    pluginId: PLUGIN,
    toolName: "echo",
    displayName: "Echo",
  });
  registerPluginEntrypoint(PLUGIN, EXAMPLE);
  mgr = new ForkPluginWorkerManager();
});

afterEach(async () => {
  await mgr.stopAll();
  unregisterPluginEntrypoint(PLUGIN);
});

describe("capability grants (#103)", () => {
  it("grant → resolve → revoke, and least-privilege guards", async () => {
    expect(await resolveGrantedForPlugin(WS, PLUGIN)).toEqual([]);

    await grantPluginCapability({
      workspaceId: WS,
      pluginId: PLUGIN,
      capability: "agent.tools.register",
    });
    expect(await resolveGrantedForPlugin(WS, PLUGIN)).toContain("agent.tools.register");
    expect(await listPluginGrants(WS, PLUGIN)).toHaveLength(1);

    // Least privilege: cannot grant a capability the manifest did not declare.
    await expect(
      grantPluginCapability({ workspaceId: WS, pluginId: PLUGIN, capability: "issues.create" }),
    ).rejects.toThrow(/did not declare/);
    // Unknown capability is rejected outright.
    await expect(
      grantPluginCapability({ workspaceId: WS, pluginId: PLUGIN, capability: "not.a.capability" }),
    ).rejects.toThrow(/unknown capability/);

    expect(await revokePluginCapability(WS, PLUGIN, "agent.tools.register")).toBe(true);
    expect(await resolveGrantedForPlugin(WS, PLUGIN)).toEqual([]);
  });

  it("assertPluginCapability is fail-closed (throws without a grant, passes with one)", async () => {
    await expect(assertPluginCapability(WS, PLUGIN, "agent.tools.register")).rejects.toBeInstanceOf(
      PluginCapabilityDeniedError,
    );
    await grantPluginCapability({
      workspaceId: WS,
      pluginId: PLUGIN,
      capability: "agent.tools.register",
    });
    await expect(
      assertPluginCapability(WS, PLUGIN, "agent.tools.register"),
    ).resolves.toBeUndefined();
  });
});

describe("tool dispatch — capability-checked (#127/#129)", () => {
  it("REFUSES an ungranted tool call (fail-closed), then SUCCEEDS once granted", async () => {
    // Ungranted → refused before any worker runs.
    await expect(
      dispatchPluginTool(WS, "echo", { hi: 1 }, { manager: mgr }),
    ).rejects.toBeInstanceOf(PluginCapabilityDeniedError);
    expect(mgr.isRunning(PLUGIN)).toBe(false);

    // Grant the tool-surface capability → the same call now round-trips to the worker.
    await grantPluginCapability({
      workspaceId: WS,
      pluginId: PLUGIN,
      capability: "agent.tools.register",
    });
    const result = await dispatchPluginTool(WS, "echo", { hi: 1 }, { manager: mgr });
    expect(result).toEqual({ echoed: { hi: 1 } });
    expect(mgr.isRunning(PLUGIN)).toBe(true);
  });
});

describe("job runner — capability-checked drain (#111/#129)", () => {
  it("fails an ungranted job, completes it once jobs.schedule is granted", async () => {
    const job = await enqueuePluginJob({
      workspaceId: WS,
      pluginId: PLUGIN,
      jobKey: "sync",
      payload: { n: 7 },
    });

    // Ungranted → the drain runs it, the worker never gets the job, and it is failed/retried.
    const denied = await drainDuePluginJob(WS, "worker-1", { manager: mgr });
    expect(denied).toMatchObject({ claimed: 1, completed: 0, failed: 1 });
    const afterDeny = await prisma.pluginJob.findUnique({ where: { id: job.id } });
    expect(afterDeny?.lastError).toMatch(/not granted/);

    // Grant jobs.schedule, force the (backed-off) job due again, drain → completes with the worker result.
    await grantPluginCapability({ workspaceId: WS, pluginId: PLUGIN, capability: "jobs.schedule" });
    await prisma.pluginJob.update({ where: { id: job.id }, data: { scheduledFor: new Date() } });
    const ok = await drainDuePluginJob(WS, "worker-1", { manager: mgr });
    expect(ok).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    const done = await prisma.pluginJob.findUnique({ where: { id: job.id } });
    expect(done?.status).toBe("done");
    expect(done?.result).toMatchObject({ ran: true, payload: { n: 7 } });
  });
});
