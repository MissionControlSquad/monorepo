import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { prisma } from "../../src/server/prisma";
import { installPlugin } from "../../src/server/services/plugins";
import { grantPluginCapability } from "../../src/server/services/plugin-grants";
import { createSecret } from "../../src/server/services/secrets";
import {
  receivePluginWebhook,
  PluginWebhookError,
  webhookSecretName,
} from "../../src/server/services/plugin-webhooks";
import { FLAG_KEYS } from "@agentcenter/utils";

// §3 plugins — inbound webhook receiver. Fail-closed: flag off / ungranted / bad signature all refuse;
// a good signature enqueues a PluginJob for the worker.
//
// HOW TO TEST:  npx vitest run tests/integration/plugin-webhooks.test.ts

const WS = "ws_plughook";
const PLUGIN = "hooky";
const HOOK = "inbound";
const RUNTIME_FLAG = FLAG_KEYS.PLUGIN_RUNTIME;

const MANIFEST = {
  apiVersion: 1,
  id: PLUGIN,
  version: "1.0.0",
  displayName: "Hooky",
  category: "automation",
  capabilities: ["webhooks.receive", "jobs.schedule"],
  webhooks: [{ hook: HOOK, jobKey: "webhook:inbound" }],
};

const SECRET = "whsec_integration";
const sign = (body: string) => createHmac("sha256", SECRET).update(body, "utf8").digest("hex");

async function setFlag(enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { key: RUNTIME_FLAG },
    create: { key: RUNTIME_FLAG, enabled, managedBy: "system" },
    update: { enabled },
  });
}

beforeEach(async () => {
  const where = { where: { workspaceId: WS } };
  await Promise.all([
    prisma.pluginJob.deleteMany(where),
    prisma.pluginKv.deleteMany(where),
    prisma.pluginGrant.deleteMany(where),
    prisma.plugin.deleteMany(where),
    prisma.secret.deleteMany(where),
  ]);
  await installPlugin(WS, MANIFEST, "profile-admin");
  await createSecret({
    workspaceId: WS,
    name: webhookSecretName(PLUGIN, HOOK),
    value: SECRET,
    createdBy: "admin",
  });
  await setFlag(true);
});

afterEach(async () => {
  await prisma.featureFlag.deleteMany({ where: { key: RUNTIME_FLAG } });
});

describe("receivePluginWebhook — fail-closed gates", () => {
  it("refuses when the PLUGIN_RUNTIME flag is off (403)", async () => {
    await setFlag(false);
    const body = JSON.stringify({ x: 1 });
    await expect(
      receivePluginWebhook({
        workspaceId: WS,
        pluginId: PLUGIN,
        hook: HOOK,
        rawBody: body,
        signature: sign(body),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses when webhooks.receive is not granted (403), even with a valid signature", async () => {
    const body = JSON.stringify({ x: 1 });
    await expect(
      receivePluginWebhook({
        workspaceId: WS,
        pluginId: PLUGIN,
        hook: HOOK,
        rawBody: body,
        signature: sign(body),
      }),
    ).rejects.toMatchObject({ status: 403, code: "CAPABILITY_DENIED" });
    expect(await prisma.pluginJob.count({ where: { workspaceId: WS } })).toBe(0);
  });

  it("refuses a bad signature (401) and enqueues nothing", async () => {
    await grantPluginCapability({
      workspaceId: WS,
      pluginId: PLUGIN,
      capability: "webhooks.receive",
    });
    const body = JSON.stringify({ x: 1 });
    await expect(
      receivePluginWebhook({
        workspaceId: WS,
        pluginId: PLUGIN,
        hook: HOOK,
        rawBody: body,
        signature: "sha256=deadbeef",
      }),
    ).rejects.toMatchObject({ status: 401, code: "BAD_SIGNATURE" });
    expect(await prisma.pluginJob.count({ where: { workspaceId: WS } })).toBe(0);
  });

  it("refuses an undeclared hook (404)", async () => {
    await grantPluginCapability({
      workspaceId: WS,
      pluginId: PLUGIN,
      capability: "webhooks.receive",
    });
    const body = "{}";
    await expect(
      receivePluginWebhook({
        workspaceId: WS,
        pluginId: PLUGIN,
        hook: "nope",
        rawBody: body,
        signature: sign(body),
      }),
    ).rejects.toBeInstanceOf(PluginWebhookError);
  });

  it("refuses a foreign/absent plugin with 404 (no existence leak)", async () => {
    const body = "{}";
    await expect(
      receivePluginWebhook({
        workspaceId: WS,
        pluginId: "ghost",
        hook: HOOK,
        rawBody: body,
        signature: sign(body),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("receivePluginWebhook — happy path + replay guard", () => {
  beforeEach(async () => {
    await grantPluginCapability({
      workspaceId: WS,
      pluginId: PLUGIN,
      capability: "webhooks.receive",
    });
  });

  it("enqueues a PluginJob on a valid signature", async () => {
    const body = JSON.stringify({ event: "ping", n: 7 });
    const res = await receivePluginWebhook({
      workspaceId: WS,
      pluginId: PLUGIN,
      hook: HOOK,
      rawBody: body,
      signature: sign(body),
    });
    expect(res.jobKey).toBe("webhook:inbound");
    const job = await prisma.pluginJob.findUnique({ where: { id: res.jobId } });
    expect(job?.status).toBe("queued");
    expect((job?.payload as { body?: unknown }).body).toEqual({ event: "ping", n: 7 });
  });

  it("is idempotent for a repeated deliveryId (replay guard) — enqueues once", async () => {
    const body = JSON.stringify({ event: "ping" });
    const first = await receivePluginWebhook({
      workspaceId: WS,
      pluginId: PLUGIN,
      hook: HOOK,
      rawBody: body,
      signature: sign(body),
      deliveryId: "d-1",
    });
    const second = await receivePluginWebhook({
      workspaceId: WS,
      pluginId: PLUGIN,
      hook: HOOK,
      rawBody: body,
      signature: sign(body),
      deliveryId: "d-1",
    });
    expect(second.duplicate).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(await prisma.pluginJob.count({ where: { workspaceId: WS } })).toBe(1);
  });
});
