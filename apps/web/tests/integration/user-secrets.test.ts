import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { decryptSecret } from "../../src/server/services/secrets-crypto";
import { declarationSecretName } from "../../src/server/services/user-secrets";

/**
 * Parity §3 #7 — user-scoped secret definitions + declarations + coverage. Real GraphQL route +
 * Postgres. Proves: admin-gated definitions, self-service declaration (encrypted, no plaintext leak),
 * coverage missing→provided, and the SECRETS_VAULT flag- + role-gates.
 */
const SECRET = "user-secrets-test-secret";
const WS_A = "ws_usersec_A";

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

const cookieFor = async (workspaceId: string, role: "admin" | "member", userId?: string) =>
  `bb-workspace-token=${await createJWT(
    { userId: userId ?? "human_" + role, workspaceId, userRole: role },
    SECRET,
  )}`;

const CREATE_DEF = `mutation($k:String!,$d:String!,$desc:String,$req:Boolean){ createUserSecretDefinition(key:$k, displayName:$d, description:$desc, required:$req){ id key required } }`;
const DECLARE = `mutation($id:String!,$v:String!){ declareUserSecret(definitionId:$id, value:$v){ id status } }`;
const COVERAGE = `query($p:String){ userSecretCoverage(profileId:$p){ total provided missing items{ key status required } } }`;

async function addDefinition(key: string, opts?: { required?: boolean; description?: string }) {
  return gql(
    CREATE_DEF,
    { k: key, d: key, desc: opts?.description ?? null, req: opts?.required ?? true },
    await cookieFor(WS_A, "admin"),
  );
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
  process.env.SECRET_ENCRYPTION_KEY = "integration-test-master-key-1234567890";
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE user_secret_declarations, user_secret_definitions, secrets CASCADE`,
  );
});

describe("definitions are admin-gated (parity §3 #7)", () => {
  it("admin creates a definition; a member cannot", async () => {
    const denied = await gql(
      CREATE_DEF,
      { k: "GITHUB_TOKEN", d: "GitHub" },
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();
    expect(denied.data?.createUserSecretDefinition).toBeFalsy();

    const ok = await addDefinition("GITHUB_TOKEN");
    expect(ok.errors).toBeFalsy();
    expect(ok.data.createUserSecretDefinition).toMatchObject({
      key: "GITHUB_TOKEN",
      required: true,
    });

    // Definition is workspace-scoped and stores no value.
    const def = await prisma.userSecretDefinition.findFirstOrThrow({
      where: { key: "GITHUB_TOKEN" },
    });
    expect(def.workspaceId).toBe(WS_A);
  });

  it("rejects an invalid key and a duplicate", async () => {
    expect((await addDefinition("bad-key")).errors).toBeDefined();
    expect((await addDefinition("DUP")).errors).toBeFalsy();
    expect((await addDefinition("DUP")).errors).toBeDefined();
  });
});

describe("declaration + coverage (parity §3 #7)", () => {
  it("a member provides a value (encrypted, no plaintext leak) and coverage flips missing→provided", async () => {
    const alice = await cookieFor(WS_A, "member", "human_alice");
    const defId = (await addDefinition("GITHUB_TOKEN")).data.createUserSecretDefinition.id;

    // Before: coverage shows the definition missing.
    const before = await gql(COVERAGE, {}, alice);
    expect(before.data.userSecretCoverage).toMatchObject({ total: 1, provided: 0, missing: 1 });
    expect(before.data.userSecretCoverage.items[0]).toMatchObject({
      key: "GITHUB_TOKEN",
      status: "missing",
    });

    // Declare.
    const plaintext = "ghp_DO-NOT-LEAK-123";
    const decl = await gql(DECLARE, { id: defId, v: plaintext }, alice);
    expect(decl.errors).toBeFalsy();
    expect(decl.data.declareUserSecret.status).toBe("provided");

    // Encrypted at rest: the backing personal secret's version is ciphertext, decrypts back, and the
    // declaration row holds no plaintext.
    const name = declarationSecretName("human_alice", "GITHUB_TOKEN");
    const secret = await prisma.secret.findFirstOrThrow({ where: { workspaceId: WS_A, name } });
    expect(secret.personal).toBe(true);
    expect(secret.createdBy).toBe("human_alice");
    const version = await prisma.secretVersion.findFirstOrThrow({ where: { secretId: secret.id } });
    expect(version.ciphertext).not.toContain(plaintext);
    expect(decryptSecret(version.ciphertext)).toBe(plaintext);
    const declRow = await prisma.userSecretDeclaration.findFirstOrThrow({
      where: { definitionId: defId },
    });
    expect(JSON.stringify(declRow)).not.toContain(plaintext);

    // The declaration GraphQL type exposes no value/ciphertext field.
    const leak = await gql(DECLARE.replace("status", "value"), { id: defId, v: "x" }, alice);
    expect(leak.errors).toBeDefined();

    // After: coverage flips to provided.
    const after = await gql(COVERAGE, {}, alice);
    expect(after.data.userSecretCoverage).toMatchObject({ total: 1, provided: 1, missing: 0 });

    // The declaration write reused recordSecretAccess (a "created" audit on the backing secret).
    const created = await prisma.secretAccessEvent.findFirst({
      where: { secretId: secret.id, action: "created" },
    });
    expect(created).not.toBeNull();
  });

  it("coverage counts only REQUIRED definitions and is per-member", async () => {
    const alice = await cookieFor(WS_A, "member", "human_alice");
    const bob = await cookieFor(WS_A, "member", "human_bob");
    const reqId = (await addDefinition("REQUIRED_KEY", { required: true })).data
      .createUserSecretDefinition.id;
    await addDefinition("OPTIONAL_KEY", { required: false });

    await gql(DECLARE, { id: reqId, v: "alice-val" }, alice);

    // Alice provided the one required def → 1 of 1.
    const aliceCov = await gql(COVERAGE, {}, alice);
    expect(aliceCov.data.userSecretCoverage).toMatchObject({ total: 1, provided: 1, missing: 0 });

    // Bob provided nothing → still 0 of 1 (per-member).
    const bobCov = await gql(COVERAGE, {}, bob);
    expect(bobCov.data.userSecretCoverage).toMatchObject({ total: 1, provided: 0, missing: 1 });
  });

  it("a member sees only their own coverage; an admin may query another member's", async () => {
    const alice = await cookieFor(WS_A, "member", "human_alice");
    const admin = await cookieFor(WS_A, "admin");
    const reqId = (await addDefinition("REQ")).data.createUserSecretDefinition.id;
    await gql(DECLARE, { id: reqId, v: "v" }, alice);

    // Member cannot request another member's coverage.
    const denied = await gql(
      COVERAGE,
      { p: "human_alice" },
      await cookieFor(WS_A, "member", "human_bob"),
    );
    expect(denied.errors).toBeDefined();

    // Admin can inspect Alice's coverage.
    const asAdmin = await gql(COVERAGE, { p: "human_alice" }, admin);
    expect(asAdmin.errors).toBeFalsy();
    expect(asAdmin.data.userSecretCoverage).toMatchObject({ provided: 1, total: 1 });
  });
});

describe("role + delete (parity §3 #7)", () => {
  it("admin deletes a definition and its declarations cascade", async () => {
    const alice = await cookieFor(WS_A, "member", "human_alice");
    const admin = await cookieFor(WS_A, "admin");
    const defId = (await addDefinition("TO_DELETE")).data.createUserSecretDefinition.id;
    await gql(DECLARE, { id: defId, v: "v" }, alice);
    expect(await prisma.userSecretDeclaration.count({ where: { definitionId: defId } })).toBe(1);

    // Member cannot delete.
    const denied = await gql(
      `mutation($id:String!){ deleteUserSecretDefinition(id:$id) }`,
      { id: defId },
      alice,
    );
    expect(denied.errors).toBeDefined();

    const del = await gql(
      `mutation($id:String!){ deleteUserSecretDefinition(id:$id) }`,
      { id: defId },
      admin,
    );
    expect(del.data.deleteUserSecretDefinition).toBe(true);
    expect(await prisma.userSecretDeclaration.count({ where: { definitionId: defId } })).toBe(0);
  });
});

describe("feature gate (parity §3 #7)", () => {
  it("rejects all user-secret ops when SECRETS_VAULT is off", async () => {
    const admin = await cookieFor(WS_A, "admin");
    try {
      setTestFeature("secrets_vault", false);
      invalidateFlagCache();
      const defs = await gql(`query{ userSecretDefinitions{ id } }`, undefined, admin);
      expect(defs.errors).toBeDefined();
      const cov = await gql(COVERAGE, {}, admin);
      expect(cov.errors).toBeDefined();
      const create = await addDefinition("BLOCKED");
      expect(create.errors).toBeDefined();
    } finally {
      resetTestFeature("secrets_vault");
      invalidateFlagCache();
    }
  });
});
