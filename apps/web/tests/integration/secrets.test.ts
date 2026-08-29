import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { decryptSecret } from "../../src/server/services/secrets-crypto";
import { getDecrypted, resolveEnvForAgent } from "../../src/server/services/secrets";
import { createTestAgent } from "../helpers";

/**
 * Epic #5 secrets vault — real GraphQL route + Postgres. Human auth via bb-workspace-token cookie.
 * Proves: encrypted-at-rest, plaintext never returned, RBAC, per-action audit, isolation, gate,
 * rotation + version pinning, and env resolution for an agent.
 */
const SECRET = "secrets-test-secret";
const WS_A = "ws_secrets_A";
const WS_B = "ws_secrets_B";

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
  const token = await createJWT({ userId: "human_" + role, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

const CREATE = `mutation($n:String!,$v:String!){ createSecret(name:$n, value:$v){ id name currentVersion workspaceId } }`;

async function makeSecret(ws: string, name: string, value: string) {
  return gql(CREATE, { n: name, v: value }, await cookieFor(ws, "admin"));
}

async function makeAgentInWs(ws: string) {
  const { agent } = await createTestAgent({ name: "SecretAgent" });
  await prisma.agent.update({ where: { id: agent.id }, data: { workspaceId: ws } });
  return agent.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
  process.env.SECRET_ENCRYPTION_KEY = "integration-test-master-key-1234567890";
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE secrets, secret_provider_configs, agents CASCADE`);
});

describe("encryption at rest + no plaintext exposure (Epic #5)", () => {
  it("stores only AES-GCM ciphertext and never returns the value via GraphQL", async () => {
    const plaintext = "sk-live-DO-NOT-LEAK-123";
    const r = await makeSecret(WS_A, "STRIPE_KEY", plaintext);
    expect(r.errors).toBeFalsy();
    const id = r.data.createSecret.id;

    // At rest: ciphertext row exists, differs from plaintext, and decrypts back.
    const version = await prisma.secretVersion.findFirstOrThrow({ where: { secretId: id } });
    expect(version.ciphertext).not.toContain(plaintext);
    expect(version.ciphertext.split(":")).toHaveLength(3);
    expect(decryptSecret(version.ciphertext)).toBe(plaintext);

    // The GraphQL Secret type has no value/ciphertext field — querying it is a validation error.
    const leak = await gql(
      `query($id:String!){ secret(id:$id){ value } }`,
      { id },
      await cookieFor(WS_A, "member"),
    );
    expect(leak.errors).toBeDefined();
  });
});

describe("RBAC (Epic #5)", () => {
  it("member cannot create; admin can", async () => {
    const denied = await gql(CREATE, { n: "K", v: "v" }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined();
    expect(denied.data?.createSecret).toBeFalsy();

    const ok = await makeSecret(WS_A, "K", "v");
    expect(ok.errors).toBeFalsy();
    expect(ok.data.createSecret.workspaceId).toBe(WS_A);
  });
});

describe("rotation + audit (Epic #5)", () => {
  it("rotate appends version 2, retires v1, repoints currentVersion, and both decrypt", async () => {
    const created = await makeSecret(WS_A, "TOKEN", "v1-value");
    const id = created.data.createSecret.id;
    const rot = await gql(
      `mutation($id:String!,$v:String!){ rotateSecret(id:$id, value:$v){ id currentVersion } }`,
      { id, v: "v2-value" },
      await cookieFor(WS_A, "admin"),
    );
    expect(rot.data.rotateSecret.currentVersion).toBe(2);

    const v1 = await prisma.secretVersion.findUniqueOrThrow({
      where: { secretId_version: { secretId: id, version: 1 } },
    });
    expect(v1.retiredAt).not.toBeNull();
    expect((await getDecrypted(WS_A, id, 1))?.value).toBe("v1-value");
    expect((await getDecrypted(WS_A, id))?.value).toBe("v2-value"); // current

    const actions = (
      await prisma.secretAccessEvent.findMany({ where: { secretId: id }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toContain("created");
    expect(actions).toContain("rotated");
  });
});

describe("bindings + env resolution (Epic #5)", () => {
  it("binds a secret to an agent and resolveEnvForAgent returns the decrypted env var", async () => {
    const agentId = await makeAgentInWs(WS_A);
    const s = await makeSecret(WS_A, "OPENAI", "sk-openai-xyz");
    const bind = await gql(
      `mutation($s:String!,$a:String!){ bindSecret(secretId:$s, scope:"agent", agentId:$a, envVarName:"OPENAI_API_KEY"){ id envVarName scope } }`,
      { s: s.data.createSecret.id, a: agentId },
      await cookieFor(WS_A, "admin"),
    );
    expect(bind.errors).toBeFalsy();
    expect(bind.data.bindSecret.envVarName).toBe("OPENAI_API_KEY");

    const env = await resolveEnvForAgent(WS_A, agentId);
    expect(env).toEqual({ OPENAI_API_KEY: "sk-openai-xyz" });

    // A bound audit event was written.
    const bound = await prisma.secretAccessEvent.findFirst({
      where: { secretId: s.data.createSecret.id, action: "bound" },
    });
    expect(bound).not.toBeNull();

    // Unbind removes the binding so it no longer resolves into the agent's env.
    const unbind = await gql(
      `mutation($id:String!){ unbindSecret(id:$id) }`,
      { id: bind.data.bindSecret.id },
      await cookieFor(WS_A, "admin"),
    );
    expect(unbind.data.unbindSecret).toBe(true);
    expect(await resolveEnvForAgent(WS_A, agentId)).toEqual({});
    expect(
      await prisma.secretAccessEvent.count({
        where: { secretId: s.data.createSecret.id, action: "unbound" },
      }),
    ).toBe(1);
  });

  it("rejects an invalid env var name", async () => {
    const agentId = await makeAgentInWs(WS_A);
    const s = await makeSecret(WS_A, "X", "v");
    const r = await gql(
      `mutation($s:String!,$a:String!){ bindSecret(secretId:$s, scope:"agent", agentId:$a, envVarName:"bad-name"){ id } }`,
      { s: s.data.createSecret.id, a: agentId },
      await cookieFor(WS_A, "admin"),
    );
    expect(r.errors).toBeDefined();
  });

  // Domain 7 P1: audit-on-resolve at the USE site.
  it("writes an `injected` access event per bound secret ONLY when a consumer context is passed", async () => {
    const agentId = await makeAgentInWs(WS_A);
    const s = await makeSecret(WS_A, "OPENAI", "sk-xyz");
    await gql(
      `mutation($s:String!,$a:String!){ bindSecret(secretId:$s, scope:"agent", agentId:$a, envVarName:"OPENAI_API_KEY"){ id } }`,
      { s: s.data.createSecret.id, a: agentId },
      await cookieFor(WS_A, "admin"),
    );
    const secretId = s.data.createSecret.id;

    // Presence-check path (no context) → NO injected audit (avoids spamming the ledger).
    await resolveEnvForAgent(WS_A, agentId);
    expect(await prisma.secretAccessEvent.count({ where: { secretId, action: "injected" } })).toBe(
      0,
    );

    // Real USE path (run injection) → one `injected` event with full provenance.
    const env = await resolveEnvForAgent(WS_A, agentId, {
      actorType: "agent",
      actorId: agentId,
      consumerType: "agent",
      consumerId: agentId,
      runId: "run_abc",
    });
    expect(env).toEqual({ OPENAI_API_KEY: "sk-xyz" });
    const injected = await prisma.secretAccessEvent.findFirst({
      where: { secretId, action: "injected" },
    });
    expect(injected).toMatchObject({
      actorType: "agent",
      agentId,
      consumerType: "agent",
      consumerId: agentId,
      configPath: "env.OPENAI_API_KEY",
      outcome: "success",
      runId: "run_abc",
    });
  });
});

describe("lifecycle status (Epic #5)", () => {
  const SET_STATUS = `mutation($id:String!,$s:String!){ setSecretStatus(id:$id, status:$s){ id status } }`;

  it("a disabled secret stops resolving into agent env; re-enabling restores it", async () => {
    const agentId = await makeAgentInWs(WS_A);
    const s = await makeSecret(WS_A, "DISABLED_TEST", "sk-live");
    const id = s.data.createSecret.id;
    await gql(
      `mutation($s:String!,$a:String!){ bindSecret(secretId:$s, scope:"agent", agentId:$a, envVarName:"API_KEY"){ id } }`,
      { s: id, a: agentId },
      await cookieFor(WS_A, "admin"),
    );
    expect(await resolveEnvForAgent(WS_A, agentId)).toEqual({ API_KEY: "sk-live" });

    const off = await gql(SET_STATUS, { id, s: "disabled" }, await cookieFor(WS_A, "admin"));
    expect(off.data.setSecretStatus.status).toBe("disabled");
    expect(await resolveEnvForAgent(WS_A, agentId)).toEqual({}); // cut off

    await gql(SET_STATUS, { id, s: "active" }, await cookieFor(WS_A, "admin"));
    expect(await resolveEnvForAgent(WS_A, agentId)).toEqual({ API_KEY: "sk-live" }); // restored
  });

  it("updateSecret edits metadata; rejects an invalid status + a member", async () => {
    const s = await makeSecret(WS_A, "META", "v");
    const id = s.data.createSecret.id;
    const upd = await gql(
      `mutation($id:String!){ updateSecret(id:$id, description:"prod key"){ id description } }`,
      { id },
      await cookieFor(WS_A, "admin"),
    );
    expect(upd.data.updateSecret.description).toBe("prod key");

    const bad = await gql(SET_STATUS, { id, s: "paused" }, await cookieFor(WS_A, "admin"));
    expect(bad.errors).toBeDefined();

    const member = await gql(SET_STATUS, { id, s: "archived" }, await cookieFor(WS_A, "member"));
    expect(member.errors).toBeDefined();
  });
});

describe("workspace isolation (Epic #5)", () => {
  it("a workspace cannot see or rotate another's secret", async () => {
    const inB = await makeSecret(WS_B, "B_ONLY", "b-value");
    const idB = inB.data.createSecret.id;

    const list = await gql(`query{ secrets{ id } }`, undefined, await cookieFor(WS_A, "member"));
    expect((list.data.secrets as any[]).map((s) => s.id)).not.toContain(idB);

    const rot = await gql(
      `mutation($id:String!){ rotateSecret(id:$id, value:"x"){ id } }`,
      { id: idB },
      await cookieFor(WS_A, "admin"),
    );
    expect(rot.errors).toBeDefined(); // NOT_FOUND across workspaces
    const fresh = await prisma.secret.findUniqueOrThrow({ where: { id: idB } });
    expect(fresh.currentVersion).toBe(1); // untouched
  });
});

describe("feature gate (Epic #5)", () => {
  it("rejects vault access when SECRETS_VAULT is off", async () => {
    const admin = await cookieFor(WS_A, "admin");
    try {
      setTestFeature(FLAG_KEYS.SECRETS_VAULT, false);
      invalidateFlagCache();
      const r = await gql(`query{ secrets{ id } }`, undefined, admin);
      expect(r.errors).toBeDefined();
      expect(r.data?.secrets).toBeFalsy();
    } finally {
      resetTestFeature(FLAG_KEYS.SECRETS_VAULT);
      invalidateFlagCache();
    }
  });
});

describe("provider configs (Epic #5)", () => {
  const CREATE_PROVIDER = `mutation($n:String!,$k:String!){ createSecretProvider(name:$n, kind:$k){ id name kind } }`;

  it("admin creates/lists providers; member is denied; a secret can bind to one", async () => {
    const admin = await cookieFor(WS_A, "admin");
    // member cannot create a provider.
    const denied = await gql(
      CREATE_PROVIDER,
      { n: "p", k: "vault" },
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();

    // admin creates a vault provider.
    const made = await gql(CREATE_PROVIDER, { n: "prod-vault", k: "vault" }, admin);
    expect(made.errors).toBeFalsy();
    const providerId = made.data.createSecretProvider.id;

    // an invalid kind is rejected.
    const bad = await gql(CREATE_PROVIDER, { n: "bad", k: "nope" }, admin);
    expect(bad.errors).toBeDefined();

    // listed for the workspace.
    const list = await gql(`query{ secretProviders{ id name kind } }`, undefined, admin);
    expect(list.data.secretProviders).toHaveLength(1);

    // a secret can be created against that provider.
    const sec = await gql(
      `mutation($n:String!,$v:String!,$p:String!){ createSecret(name:$n, value:$v, providerId:$p){ id providerId } }`,
      { n: "VIA_VAULT", v: "s", p: providerId },
      admin,
    );
    expect(sec.errors).toBeFalsy();
    expect(sec.data.createSecret.providerId).toBe(providerId);

    // an unknown provider id is rejected.
    const badRef = await gql(
      `mutation($n:String!,$v:String!,$p:String!){ createSecret(name:$n, value:$v, providerId:$p){ id } }`,
      { n: "ORPHAN", v: "s", p: "does-not-exist" },
      admin,
    );
    expect(badRef.errors).toBeDefined();

    // deleting the provider nulls the secret's providerId (secret survives).
    const del = await gql(
      `mutation($id:String!){ deleteSecretProvider(id:$id) }`,
      { id: providerId },
      admin,
    );
    expect(del.data.deleteSecretProvider).toBe(true);
    const orphaned = await prisma.secret.findFirstOrThrow({ where: { name: "VIA_VAULT" } });
    expect(orphaned.providerId).toBeNull();
  });

  it("a provider name cannot collide within a workspace", async () => {
    const admin = await cookieFor(WS_A, "admin");
    await gql(CREATE_PROVIDER, { n: "dup", k: "env" }, admin);
    const again = await gql(CREATE_PROVIDER, { n: "dup", k: "env" }, admin);
    expect(again.errors).toBeDefined();
  });

  // Domain 7 P2: health check writes the previously-never-written healthy/lastCheckedAt/lastError.
  it("checkSecretProviderHealth persists health: env healthy, unconfigured vault coming_soon", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const CHECK = `mutation($id:String!){ checkSecretProviderHealth(id:$id){ id healthy lastCheckedAt lastError } }`;

    const env = await gql(CREATE_PROVIDER, { n: "local", k: "env" }, admin);
    const envHealth = await gql(CHECK, { id: env.data.createSecretProvider.id }, admin);
    expect(envHealth.data.checkSecretProviderHealth).toMatchObject({
      healthy: true,
      lastError: null,
    });
    expect(envHealth.data.checkSecretProviderHealth.lastCheckedAt).toBeTruthy();

    // a vault with no config → unhealthy with a missing-config error
    const vault = await gql(CREATE_PROVIDER, { n: "v", k: "vault" }, admin);
    const vaultHealth = await gql(CHECK, { id: vault.data.createSecretProvider.id }, admin);
    expect(vaultHealth.data.checkSecretProviderHealth.healthy).toBe(false);
    expect(vaultHealth.data.checkSecretProviderHealth.lastError).toMatch(/missing required config/);

    // member cannot run a health check
    const denied = await gql(
      CHECK,
      { id: env.data.createSecretProvider.id },
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();
  });
});

describe("bulk import (Epic #5)", () => {
  const IMPORT = `mutation($t:String!,$o:Boolean){ importSecrets(text:$t, overwrite:$o){ created skipped rotated invalidLines } }`;

  it("creates secrets from a .env, skips existing, and reports invalid lines", async () => {
    const admin = await cookieFor(WS_A, "admin");
    await makeSecret(WS_A, "EXISTING", "old"); // pre-existing → skipped

    const r = await gql(
      IMPORT,
      { t: "# comment\nNEW_ONE=a\nNEW_TWO=b\nEXISTING=ignored\nbad-line" },
      admin,
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.importSecrets).toEqual({ created: 2, skipped: 1, rotated: 0, invalidLines: 1 });

    // The two new secrets landed encrypted; the existing one was NOT touched.
    expect(await prisma.secret.count({ where: { workspaceId: WS_A } })).toBe(3);
    expect((await getDecrypted(WS_A, (await secretId("NEW_ONE")) ?? ""))?.value).toBe("a");
    expect((await getDecrypted(WS_A, (await secretId("EXISTING")) ?? ""))?.value).toBe("old");
  });

  it("overwrite=true rotates an existing secret instead of skipping", async () => {
    const admin = await cookieFor(WS_A, "admin");
    await makeSecret(WS_A, "ROT", "v1");
    const r = await gql(IMPORT, { t: "ROT=v2", o: true }, admin);
    expect(r.data.importSecrets).toEqual({ created: 0, skipped: 0, rotated: 1, invalidLines: 0 });
    const id = (await secretId("ROT")) ?? "";
    expect((await getDecrypted(WS_A, id))?.value).toBe("v2");
    expect((await prisma.secret.findUniqueOrThrow({ where: { id } })).currentVersion).toBe(2);
  });

  it("a member cannot bulk-import", async () => {
    const r = await gql(IMPORT, { t: "X=y" }, await cookieFor(WS_A, "member"));
    expect(r.errors).toBeDefined();
  });

  async function secretId(name: string) {
    return (
      await prisma.secret.findFirst({ where: { workspaceId: WS_A, name }, select: { id: true } })
    )?.id;
  }
});

describe("personal (member-owned) secrets (Epic #5)", () => {
  // Two distinct members in WS_A, plus the admin.
  const memberCookie = async (userId: string) =>
    `bb-workspace-token=${await createJWT({ userId, workspaceId: WS_A, userRole: "member" }, SECRET)}`;
  const CREATE_USER = `mutation($n:String!,$v:String!){ createUserSecret(name:$n, value:$v){ id name personal createdBy } }`;

  it("a member creates a personal secret; only the owner sees it, admins/others do not", async () => {
    const alice = await memberCookie("human_alice");
    const bob = await memberCookie("human_bob");

    const made = await gql(CREATE_USER, { n: "ALICE_KEY", v: "sk-alice" }, alice);
    expect(made.errors).toBeFalsy();
    expect(made.data.createUserSecret).toMatchObject({ personal: true, createdBy: "human_alice" });

    // A workspace secret everyone sees, for contrast.
    await makeSecret(WS_A, "SHARED", "x");

    const aliceList = await gql(`query{ secrets{ name personal } }`, undefined, alice);
    expect((aliceList.data.secrets as any[]).map((s) => s.name).sort()).toEqual([
      "ALICE_KEY",
      "SHARED",
    ]);

    // Bob (another member) sees the workspace secret but NOT Alice's personal one.
    const bobList = await gql(`query{ secrets{ name } }`, undefined, bob);
    expect((bobList.data.secrets as any[]).map((s) => s.name)).toEqual(["SHARED"]);

    // The admin also does NOT see Alice's personal secret.
    const adminList = await gql(
      `query{ secrets{ name } }`,
      undefined,
      await cookieFor(WS_A, "admin"),
    );
    expect((adminList.data.secrets as any[]).map((s) => s.name)).toEqual(["SHARED"]);
  });

  it("only the owner can rotate/disable a personal secret", async () => {
    const alice = await memberCookie("human_alice");
    const bob = await memberCookie("human_bob");
    const id = (await gql(CREATE_USER, { n: "ROT_ME", v: "v1" }, alice)).data.createUserSecret.id;

    // Bob cannot rotate Alice's personal secret.
    const bobRot = await gql(
      `mutation($id:String!,$v:String!){ rotateSecret(id:$id, value:$v){ currentVersion } }`,
      { id, v: "v2" },
      bob,
    );
    expect(bobRot.errors).toBeDefined();

    // Neither can the admin (workspace admin ≠ personal owner).
    const adminStatus = await gql(
      `mutation($id:String!){ setSecretStatus(id:$id, status:"disabled"){ status } }`,
      { id },
      await cookieFor(WS_A, "admin"),
    );
    expect(adminStatus.errors).toBeDefined();

    // Alice (owner) can rotate.
    const ok = await gql(
      `mutation($id:String!,$v:String!){ rotateSecret(id:$id, value:$v){ currentVersion } }`,
      { id, v: "v2" },
      alice,
    );
    expect(ok.data.rotateSecret.currentVersion).toBe(2);
  });

  it("a member remains unable to manage a WORKSPACE secret", async () => {
    const alice = await memberCookie("human_alice");
    const shared = (await makeSecret(WS_A, "TEAM_KEY", "v")).data.createSecret.id;
    const denied = await gql(
      `mutation($id:String!,$v:String!){ rotateSecret(id:$id, value:$v){ id } }`,
      { id: shared, v: "v2" },
      alice,
    );
    expect(denied.errors).toBeDefined();
  });

  it("the owner can bind their personal secret into an agent and it resolves", async () => {
    const alice = await memberCookie("human_alice");
    const agentId = await makeAgentInWs(WS_A);
    const id = (await gql(CREATE_USER, { n: "PERSONAL_ENV", v: "sk-personal" }, alice)).data
      .createUserSecret.id;
    const bind = await gql(
      `mutation($s:String!,$a:String!){ bindSecret(secretId:$s, scope:"agent", agentId:$a, envVarName:"MY_KEY"){ id } }`,
      { s: id, a: agentId },
      alice,
    );
    expect(bind.errors).toBeFalsy();
    expect(await resolveEnvForAgent(WS_A, agentId)).toEqual({ MY_KEY: "sk-personal" });
  });
});
