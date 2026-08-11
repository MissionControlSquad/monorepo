import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../src/server/prisma";
import { installPlugin } from "../../src/server/services/plugins";
import {
  grantPluginCapability,
  PluginCapabilityDeniedError,
} from "../../src/server/services/plugin-grants";
import {
  registerPluginEntrypoint,
  unregisterPluginEntrypoint,
} from "../../src/server/services/plugin-runtime";
import {
  dispatchPluginApiRoute,
  matchDeclaredApiRoute,
  normalizeRoutePath,
  PluginApiRouteError,
} from "../../src/server/services/plugin-api-routes";
import { ForkPluginWorkerManager } from "../../src/server/services/plugin-worker-manager";
import { FLAG_KEYS } from "@agentcenter/utils";

// §3 plugins — scoped plugin API routes. Capability-checked, fail-closed dispatch into the plugin
// worker (running the in-repo example plugin's `routes` map).
//
// HOW TO TEST:  npx vitest run tests/integration/plugin-api-routes.test.ts

const WS = "ws_plugapi";
const PLUGIN = "apiacme";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.join(DIR, "../fixtures/example-plugin.mjs");
const RUNTIME_FLAG = FLAG_KEYS.PLUGIN_RUNTIME;

const MANIFEST = {
  apiVersion: 1,
  id: PLUGIN,
  version: "1.0.0",
  displayName: "API Acme",
  category: "automation",
  capabilities: ["issues.read"],
  apiRoutes: [
    { path: "/status", method: "GET", capability: "issues.read" },
    { path: "/echo", method: "POST", capability: "issues.read" },
  ],
};

let mgr: ForkPluginWorkerManager;

async function setFlag(enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { key: RUNTIME_FLAG },
    create: { key: RUNTIME_FLAG, enabled, managedBy: "system" },
    update: { enabled },
  });
}

beforeEach(async () => {
  const where = { where: { workspaceId: WS } };
  await Promise.all([prisma.pluginGrant.deleteMany(where), prisma.plugin.deleteMany(where)]);
  await installPlugin(WS, MANIFEST, "profile-admin");
  registerPluginEntrypoint(PLUGIN, EXAMPLE);
  mgr = new ForkPluginWorkerManager();
  await setFlag(true);
});

afterEach(async () => {
  await mgr.stopAll();
  unregisterPluginEntrypoint(PLUGIN);
  await prisma.featureFlag.deleteMany({ where: { key: RUNTIME_FLAG } });
});

describe("matchDeclaredApiRoute (pure)", () => {
  it("matches on method + normalized path, defaulting method to GET", () => {
    expect(matchDeclaredApiRoute(MANIFEST, "GET", "/status")?.path).toBe("/status");
    expect(matchDeclaredApiRoute(MANIFEST, "get", "status/")?.path).toBe("/status");
    expect(matchDeclaredApiRoute(MANIFEST, "POST", "/echo")?.path).toBe("/echo");
    expect(matchDeclaredApiRoute(MANIFEST, "GET", "/echo")).toBeNull(); // wrong method
    expect(matchDeclaredApiRoute(MANIFEST, "GET", "/missing")).toBeNull();
    expect(normalizeRoutePath("foo/bar/")).toBe("/foo/bar");
  });
});

describe("dispatchPluginApiRoute — capability gate (fail-closed)", () => {
  it("REFUSES an ungranted route (403 CAPABILITY_DENIED) before any worker runs", async () => {
    await expect(
      dispatchPluginApiRoute(
        { workspaceId: WS, pluginId: PLUGIN, method: "GET", path: "/status" },
        { manager: mgr },
      ),
    ).rejects.toMatchObject({ status: 403, code: "CAPABILITY_DENIED" });
    expect(mgr.isRunning(PLUGIN)).toBe(false);
  });

  it("SUCCEEDS once the route capability is granted — dispatches into the worker", async () => {
    await grantPluginCapability({ workspaceId: WS, pluginId: PLUGIN, capability: "issues.read" });

    const status = await dispatchPluginApiRoute(
      { workspaceId: WS, pluginId: PLUGIN, method: "GET", path: "/status", query: { q: "1" } },
      { manager: mgr },
    );
    expect(status).toMatchObject({ ok: true, method: "GET", query: { q: "1" } });

    const echo = await dispatchPluginApiRoute(
      {
        workspaceId: WS,
        pluginId: PLUGIN,
        method: "POST",
        path: "/echo",
        body: { hello: "world" },
      },
      { manager: mgr },
    );
    expect(echo).toEqual({ echoed: { hello: "world" } });
    expect(mgr.isRunning(PLUGIN)).toBe(true);
  });

  it("refuses an undeclared route with 404", async () => {
    await grantPluginCapability({ workspaceId: WS, pluginId: PLUGIN, capability: "issues.read" });
    await expect(
      dispatchPluginApiRoute(
        { workspaceId: WS, pluginId: PLUGIN, method: "GET", path: "/nope" },
        { manager: mgr },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses when the PLUGIN_RUNTIME flag is off (403)", async () => {
    await setFlag(false);
    await grantPluginCapability({ workspaceId: WS, pluginId: PLUGIN, capability: "issues.read" });
    await expect(
      dispatchPluginApiRoute(
        { workspaceId: WS, pluginId: PLUGIN, method: "GET", path: "/status" },
        { manager: mgr },
      ),
    ).rejects.toMatchObject({ status: 403, code: "FEATURE_DISABLED" });
  });

  it("normalizes the PluginCapabilityDeniedError into a PluginApiRouteError", async () => {
    const err = await dispatchPluginApiRoute(
      { workspaceId: WS, pluginId: PLUGIN, method: "GET", path: "/status" },
      { manager: mgr },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(PluginApiRouteError);
    expect(err).not.toBeInstanceOf(PluginCapabilityDeniedError);
  });
});
