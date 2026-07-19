import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
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
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE secrets, agents CASCADE`);
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
      await prisma.featureFlag.upsert({
        where: { key: "secrets_vault" },
        create: { key: "secrets_vault", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const r = await gql(`query{ secrets{ id } }`, undefined, admin);
      expect(r.errors).toBeDefined();
      expect(r.data?.secrets).toBeFalsy();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "secrets_vault" } });
      invalidateFlagCache();
    }
  });
});
