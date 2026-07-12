import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";

/**
 * Epic #6 plugin registry — real GraphQL route + Postgres. PLUGIN_SDK is off by default; happy-path
 * tests enable it. admin-only, workspace-isolated. No runtime — install records inert metadata.
 */
const SECRET = "plugin-test-secret";
const WS_A = "ws_plugin_A";
const WS_B = "ws_plugin_B";
let humanId = "";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text
    ? (JSON.parse(text) as { data?: any; errors?: { message: string }[] })
    : { errors: [{ message: "empty" }] };
}
async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: humanId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}
async function setPluginSdk(enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { key: "plugin_sdk" },
    create: { key: "plugin_sdk", enabled, managedBy: "user" },
    update: { enabled },
  });
  invalidateFlagCache();
}
const INSTALL = `mutation($m:JSON!){ installPlugin(manifest:$m){ id pluginId version enabled status capabilities } }`;
const PLUGINS = `query{ plugins{ pluginId version enabled status } }`;

const manifest = (over: Record<string, unknown> = {}) => ({
  apiVersion: 1,
  id: "acme",
  version: "1.0.0",
  displayName: "Acme",
  category: "connector",
  capabilities: ["projects.read"],
  ...over,
});

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE plugins, profiles CASCADE`);
  await prisma.featureFlag.deleteMany({ where: { key: "plugin_sdk" } });
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Plugin Human" } });
  humanId = p.id;
});

describe("plugin install (Epic #6)", () => {
  it("validates + persists a well-formed manifest", async () => {
    await setPluginSdk(true);
    const r = await gql(INSTALL, { m: manifest() }, await cookieFor(WS_A, "admin"));
    expect(r.errors).toBeFalsy();
    expect(r.data.installPlugin).toMatchObject({
      pluginId: "acme",
      version: "1.0.0",
      enabled: true,
      status: "installed",
    });
  });

  it("rejects an invalid manifest (unknown capability)", async () => {
    await setPluginSdk(true);
    const r = await gql(
      INSTALL,
      { m: manifest({ capabilities: ["root.access"] }) },
      await cookieFor(WS_A, "admin"),
    );
    expect(r.errors).toBeDefined();
    expect(await prisma.plugin.count()).toBe(0);
  });

  it("re-install with a higher version upgrades in place (one row, preserves enabled)", async () => {
    await setPluginSdk(true);
    const admin = await cookieFor(WS_A, "admin");
    await gql(INSTALL, { m: manifest() }, admin);
    // Disable it, then re-install a new version — enabled state is preserved across the upgrade.
    await gql(
      `mutation($p:String!){ setPluginEnabled(pluginId:$p, enabled:false){ enabled } }`,
      { p: "acme" },
      admin,
    );
    const up = await gql(INSTALL, { m: manifest({ version: "2.0.0" }) }, admin);
    expect(up.data.installPlugin.version).toBe("2.0.0");
    expect(up.data.installPlugin.enabled).toBe(false); // preserved
    expect(await prisma.plugin.count({ where: { workspaceId: WS_A } })).toBe(1);
  });

  it("enable/disable flips status; uninstall removes the row", async () => {
    await setPluginSdk(true);
    const admin = await cookieFor(WS_A, "admin");
    await gql(INSTALL, { m: manifest() }, admin);
    const dis = await gql(
      `mutation($p:String!){ setPluginEnabled(pluginId:$p, enabled:false){ enabled status } }`,
      { p: "acme" },
      admin,
    );
    expect(dis.data.setPluginEnabled).toMatchObject({ enabled: false, status: "disabled" });
    const rm = await gql(
      `mutation($p:String!){ uninstallPlugin(pluginId:$p) }`,
      { p: "acme" },
      admin,
    );
    expect(rm.data.uninstallPlugin).toBe(true);
    expect(await prisma.plugin.count()).toBe(0);
  });
});

describe("plugin guards (Epic #6)", () => {
  it("is admin-only — a member cannot install", async () => {
    await setPluginSdk(true);
    const denied = await gql(INSTALL, { m: manifest() }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined();
    expect(await prisma.plugin.count()).toBe(0);
  });

  it("is workspace-isolated — WS_A cannot see WS_B's plugins", async () => {
    await setPluginSdk(true);
    await gql(INSTALL, { m: manifest({ id: "b-only" }) }, await cookieFor(WS_B, "admin"));
    const list = await gql(PLUGINS, undefined, await cookieFor(WS_A, "admin"));
    expect(list.data.plugins).toHaveLength(0);
  });

  it("is denied when PLUGIN_SDK is off (default)", async () => {
    await setPluginSdk(false);
    const r = await gql(INSTALL, { m: manifest() }, await cookieFor(WS_A, "admin"));
    expect(r.errors).toBeDefined();
  });
});
