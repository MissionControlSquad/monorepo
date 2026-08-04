import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  registerHostService,
  setHostServiceStatus,
  listHostServices,
  resolvePluginEnvironmentDriver,
} from "../../src/server/services/plugin-host-services";
import {
  resolvePluginSecrets,
  pluginSecretDependencies,
  maskPluginConfig,
} from "../../src/server/services/plugin-secrets";
import { createSecret } from "../../src/server/services/secrets";

// Parity #107 (env driver) / #110 (host services) / #124 (secrets handler).
const WS = "ws_pluginhost";
const PLUGIN = "acme";

async function installEffectivePlugin(config?: unknown) {
  await prisma.plugin.deleteMany({ where: { workspaceId: WS, pluginId: PLUGIN } });
  await prisma.plugin.create({
    data: {
      workspaceId: WS,
      pluginId: PLUGIN,
      name: "Acme",
      version: "1.0.0",
      displayName: "Acme",
      category: "automation",
      manifest: {},
      status: "installed",
      enabled: true,
      config: (config ?? undefined) as never,
    },
  });
}

beforeEach(async () => {
  await Promise.all([
    prisma.pluginHostService.deleteMany({ where: { workspaceId: WS } }),
    prisma.plugin.deleteMany({ where: { workspaceId: WS } }),
    prisma.secret.deleteMany({ where: { workspaceId: WS } }),
  ]);
  process.env.SYSTEM_SECRET = "plugin-host-secret";
});

describe("plugin host services (#110)", () => {
  it("registers, transitions status, and lists", async () => {
    const svc = await registerHostService({
      workspaceId: WS,
      pluginId: PLUGIN,
      serviceKey: "api",
      kind: "service",
    });
    expect(svc.status).toBe("declared");
    const running = await setHostServiceStatus(WS, svc.id, "running", {
      endpoint: "http://127.0.0.1:9000",
    });
    expect(running).toMatchObject({ status: "running", endpoint: "http://127.0.0.1:9000" });
    expect(await listHostServices(WS, { kind: "service" })).toHaveLength(1);
  });
});

describe("plugin environment driver (#107)", () => {
  it("resolves a running driver only for an effective plugin", async () => {
    const drv = await registerHostService({
      workspaceId: WS,
      pluginId: PLUGIN,
      serviceKey: "acme-vm",
      kind: "environment_driver",
    });
    // not running yet → unresolved
    expect(await resolvePluginEnvironmentDriver(WS, "acme-vm")).toBeNull();
    await setHostServiceStatus(WS, drv.id, "running");
    // running but no Plugin row → not effective → unresolved
    expect(await resolvePluginEnvironmentDriver(WS, "acme-vm")).toBeNull();
    await installEffectivePlugin();
    expect((await resolvePluginEnvironmentDriver(WS, "acme-vm"))?.serviceKey).toBe("acme-vm");
  });
});

describe("plugin secrets handler (#124)", () => {
  it("resolves config secret refs for an effective plugin and masks for display", async () => {
    const secret = await createSecret({
      workspaceId: WS,
      name: "API_KEY",
      value: "s3cr3t",
      createdBy: "test",
    });
    expect(secret).toBeTruthy();
    await installEffectivePlugin({ url: "https://x", token: { secretRef: { name: "API_KEY" } } });

    expect(await pluginSecretDependencies(WS, PLUGIN)).toEqual(["API_KEY"]);
    const resolved = (await resolvePluginSecrets(WS, PLUGIN)) as { token: string };
    expect(resolved.token).toBe("s3cr3t");
    const masked = (await maskPluginConfig(WS, PLUGIN)) as { token: string };
    expect(masked.token).toBe("secret:API_KEY"); // no plaintext
  });

  it("refuses to resolve secrets for an inactive plugin", async () => {
    await installEffectivePlugin({ token: { secretRef: { name: "X" } } });
    await prisma.plugin.update({
      where: { workspaceId_pluginId: { workspaceId: WS, pluginId: PLUGIN } },
      data: { enabled: false },
    });
    await expect(resolvePluginSecrets(WS, PLUGIN)).rejects.toThrow(/not active/);
  });
});
