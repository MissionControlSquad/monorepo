import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import {
  createSecret,
  rotateSecret,
  rotateManagedSecret,
  bindSecret,
  resolveEnvForAgent,
  resolveBindingsForAgent,
} from "../../src/server/services/secrets";
import type { AwsSecretsClient, FetchImpl } from "../../src/server/services/secret-external";
import { createTestAgent } from "../helpers";

/**
 * Richer secret bindings + provider WRITE-side managed rotation (parity §3 secrets depth).
 * Proves: additive binding fields (configPath/versionSelector/projectionClass/tool_connection scope)
 * with safe defaults; resolveEnvForAgent honors a pinned versionSelector; resolveBindingsForAgent
 * projects file/inline_ref via configPath; managed rotation writes a new version + audit through a
 * MOCKED provider client (no live cloud call); and the flag + role gates on the new mutation.
 */
const SECRET = "binding-richness-secret";
const WS = "ws_binding_richness";

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

async function cookieFor(role: "admin" | "member") {
  const token = await createJWT(
    { userId: "human_" + role, workspaceId: WS, userRole: role },
    SECRET,
  );
  return `bb-workspace-token=${token}`;
}

async function makeAgent() {
  const { agent } = await createTestAgent({ name: "BindAgent" });
  await prisma.agent.update({ where: { id: agent.id }, data: { workspaceId: WS } });
  return agent.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
  process.env.SECRET_ENCRYPTION_KEY = "integration-test-master-key-1234567890";
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE secrets, secret_provider_configs, agents CASCADE`);
});

describe("richer binding fields — additive with safe defaults", () => {
  it("a legacy-style bind (no new fields) defaults to env / latest / null configPath and resolves as before", async () => {
    const agentId = await makeAgent();
    const s = await createSecret({
      workspaceId: WS,
      name: "OPENAI",
      value: "sk-1",
      createdBy: "u",
    });
    const b = await bindSecret({
      workspaceId: WS,
      secretId: s.id,
      scope: "agent",
      agentId,
      envVarName: "OPENAI_API_KEY",
      createdBy: "u",
    });
    expect(b.projectionClass).toBe("env");
    expect(b.versionSelector).toBe("latest");
    expect(b.configPath).toBeNull();
    expect(await resolveEnvForAgent(WS, agentId)).toEqual({ OPENAI_API_KEY: "sk-1" });
  });

  it("resolveEnvForAgent honors a configPath + PINNED versionSelector (returns the pinned version)", async () => {
    const agentId = await makeAgent();
    const s = await createSecret({ workspaceId: WS, name: "TOKEN", value: "v1", createdBy: "u" });
    await rotateSecret({ workspaceId: WS, secretId: s.id, value: "v2", createdBy: "u" }); // currentVersion → 2

    await bindSecret({
      workspaceId: WS,
      secretId: s.id,
      scope: "agent",
      agentId,
      envVarName: "API_KEY",
      configPath: "auth.token",
      versionSelector: "1", // pin to the OLD version
      createdBy: "u",
    });
    // Latest is v2, but the binding is pinned to v1 → resolves the v1 value.
    expect(await resolveEnvForAgent(WS, agentId)).toEqual({ API_KEY: "v1" });
  });

  it("resolveBindingsForAgent projects file + inline_ref bindings via configPath", async () => {
    const agentId = await makeAgent();
    const env = await createSecret({ workspaceId: WS, name: "ENVV", value: "e", createdBy: "u" });
    const file = await createSecret({
      workspaceId: WS,
      name: "PEM",
      value: "CERT",
      createdBy: "u",
    });
    const inline = await createSecret({
      workspaceId: WS,
      name: "TOK",
      value: "tok",
      createdBy: "u",
    });

    await bindSecret({
      workspaceId: WS,
      secretId: env.id,
      scope: "agent",
      agentId,
      envVarName: "E",
      createdBy: "u",
    });
    await bindSecret({
      workspaceId: WS,
      secretId: file.id,
      scope: "agent",
      agentId,
      envVarName: "TLS_CERT",
      projectionClass: "file",
      configPath: "certs/tls.pem",
      createdBy: "u",
    });
    await bindSecret({
      workspaceId: WS,
      secretId: inline.id,
      scope: "agent",
      agentId,
      envVarName: "AUTH_TOKEN",
      projectionClass: "inline_ref",
      configPath: "auth.token",
      createdBy: "u",
    });

    const proj = await resolveBindingsForAgent(WS, agentId);
    expect(proj.env).toEqual({ E: "e" }); // file/inline_ref do NOT leak into env
    expect(proj.files).toEqual([{ path: "certs/tls.pem", value: "CERT" }]);
    expect(proj.inlineRefs).toEqual([{ path: "auth.token", value: "tok" }]);
  });

  it("rejects a non-env projection without a configPath, and an invalid projectionClass", async () => {
    const agentId = await makeAgent();
    const s = await createSecret({ workspaceId: WS, name: "X", value: "v", createdBy: "u" });
    await expect(
      bindSecret({
        workspaceId: WS,
        secretId: s.id,
        scope: "agent",
        agentId,
        envVarName: "X",
        projectionClass: "file",
        createdBy: "u",
      }),
    ).rejects.toThrow(/requires a configPath/);
    await expect(
      bindSecret({
        workspaceId: WS,
        secretId: s.id,
        scope: "agent",
        agentId,
        envVarName: "X",
        projectionClass: "bogus",
        configPath: "a.b",
        createdBy: "u",
      }),
    ).rejects.toThrow(/projectionClass/);
  });

  it("supports the tool_connection scope (requires a toolConnectionId)", async () => {
    const s = await createSecret({ workspaceId: WS, name: "TC", value: "v", createdBy: "u" });
    await expect(
      bindSecret({
        workspaceId: WS,
        secretId: s.id,
        scope: "tool_connection",
        envVarName: "T",
        createdBy: "u",
      }),
    ).rejects.toThrow(/toolConnectionId/);
    const b = await bindSecret({
      workspaceId: WS,
      secretId: s.id,
      scope: "tool_connection",
      toolConnectionId: "tc_123",
      envVarName: "T",
      createdBy: "u",
    });
    expect(b.scope).toBe("tool_connection");
    expect(b.toolConnectionId).toBe("tc_123");
  });

  it("exposes the new binding fields over GraphQL (bind + list)", async () => {
    const agentId = await makeAgent();
    const admin = await cookieFor("admin");
    const s = await createSecret({
      workspaceId: WS,
      name: "GQL",
      value: "v",
      createdBy: "human_admin",
    });
    const bind = await gql(
      `mutation($s:String!,$a:String!){ bindSecret(secretId:$s, scope:"agent", agentId:$a, envVarName:"K", configPath:"auth.token", versionSelector:"latest", projectionClass:"inline_ref"){ id configPath versionSelector projectionClass } }`,
      { s: s.id, a: agentId },
      admin,
    );
    expect(bind.errors).toBeFalsy();
    expect(bind.data.bindSecret).toMatchObject({
      configPath: "auth.token",
      versionSelector: "latest",
      projectionClass: "inline_ref",
    });

    const list = await gql(
      `query{ secrets{ bindings{ configPath projectionClass } } }`,
      undefined,
      admin,
    );
    expect(list.data.secrets[0].bindings[0]).toMatchObject({
      configPath: "auth.token",
      projectionClass: "inline_ref",
    });
  });
});

describe("provider WRITE-side managed rotation (mocked provider)", () => {
  async function makeVaultProvider() {
    return prisma.secretProviderConfig.create({
      data: {
        workspaceId: WS,
        name: "vault",
        kind: "vault",
        config: { address: "https://v", path: "app/x" },
      },
    });
  }

  it("rotates a vault-backed secret via a MOCKED fetch, recording a new version + audit", async () => {
    process.env.VAULT_TOKEN = "test-token"; // token from env → no secret-ref resolution needed
    const provider = await makeVaultProvider();
    const s = await createSecret({
      workspaceId: WS,
      name: "OPENAI",
      value: "old",
      providerId: provider.id,
      createdBy: "u",
    });

    const calls: { url: string; body: string }[] = [];
    const fetchImpl = ((url: string, init: { body?: string }) => {
      calls.push({ url, body: init.body ?? "" });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: { version: 2 } }),
        text: async () => "",
      });
    }) as unknown as FetchImpl;

    const updated = await rotateManagedSecret({
      workspaceId: WS,
      secretId: s.id,
      value: "new-value",
      createdBy: "human_admin",
      fetchImpl,
    });

    // Wrote to the external store...
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://v/v1/secret/data/app/x");
    expect(JSON.parse(calls[0].body)).toEqual({ data: { OPENAI: "new-value" } });

    // ...and recorded a NEW local version + a rotated audit with success outcome.
    expect(updated.currentVersion).toBe(2);
    const v2 = await prisma.secretVersion.findUnique({
      where: { secretId_version: { secretId: s.id, version: 2 } },
    });
    expect(v2).not.toBeNull();
    const audit = await prisma.secretAccessEvent.findFirst({
      where: { secretId: s.id, action: "rotated", outcome: "success" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.version).toBe(2);
  });

  it("rotates an aws-backed secret via a MOCKED client (PutSecretValue)", async () => {
    const provider = await prisma.secretProviderConfig.create({
      data: {
        workspaceId: WS,
        name: "aws",
        kind: "aws",
        config: { region: "us-east-1", secretNamePrefix: "prod/" },
      },
    });
    const s = await createSecret({
      workspaceId: WS,
      name: "DB_PW",
      value: "old",
      providerId: provider.id,
      createdBy: "u",
    });

    const put = vi.fn(
      async ({ SecretId, SecretString }: { SecretId: string; SecretString: string }) => {
        expect(SecretId).toBe("prod/DB_PW");
        expect(SecretString).toBe("rotated");
        return { VersionId: "v-9" };
      },
    );
    const client: AwsSecretsClient = { getSecretValue: async () => ({}), putSecretValue: put };

    const updated = await rotateManagedSecret({
      workspaceId: WS,
      secretId: s.id,
      value: "rotated",
      createdBy: "human_admin",
      clientFactory: () => client,
    });
    expect(put).toHaveBeenCalledOnce();
    expect(updated.currentVersion).toBe(2);
  });

  it("on a provider failure it records a provider_error audit and does NOT bump the version", async () => {
    process.env.VAULT_TOKEN = "test-token";
    const provider = await makeVaultProvider();
    const s = await createSecret({
      workspaceId: WS,
      name: "FAILS",
      value: "old",
      providerId: provider.id,
      createdBy: "u",
    });

    const fetchImpl = (() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: async () => ({}),
        text: async () => "",
      })) as unknown as FetchImpl;

    await expect(
      rotateManagedSecret({
        workspaceId: WS,
        secretId: s.id,
        value: "x",
        createdBy: "human_admin",
        fetchImpl,
      }),
    ).rejects.toThrow(/Provider rotation failed/);

    const fresh = await prisma.secret.findUniqueOrThrow({ where: { id: s.id } });
    expect(fresh.currentVersion).toBe(1); // untouched
    const err = await prisma.secretAccessEvent.findFirst({
      where: { secretId: s.id, action: "rotated", outcome: "provider_error" },
    });
    expect(err).not.toBeNull();
    expect(err?.errorCode).toBe("access_denied");
  });

  it("rejects managed rotation of a secret that is not provider-backed", async () => {
    const s = await createSecret({ workspaceId: WS, name: "LOCAL", value: "v", createdBy: "u" });
    await expect(
      rotateManagedSecret({ workspaceId: WS, secretId: s.id, value: "x", createdBy: "u" }),
    ).rejects.toThrow(/not backed by an external provider/);
  });
});

describe("rotateManagedSecret GraphQL gates", () => {
  it("a member is denied; and the flag off denies the admin", async () => {
    const provider = await prisma.secretProviderConfig.create({
      data: {
        workspaceId: WS,
        name: "vault",
        kind: "vault",
        config: { address: "https://v", path: "p" },
      },
    });
    const s = await createSecret({
      workspaceId: WS,
      name: "GATED",
      value: "v",
      providerId: provider.id,
      createdBy: "human_admin",
    });
    const MUT = `mutation($id:String!,$v:String!){ rotateManagedSecret(id:$id, value:$v){ id } }`;

    // member → FORBIDDEN before any provider call.
    const denied = await gql(MUT, { id: s.id, v: "x" }, await cookieFor("member"));
    expect(denied.errors).toBeDefined();
    expect(denied.data?.rotateManagedSecret).toBeFalsy();

    // flag off → FEATURE_DISABLED before any provider call.
    try {
      await prisma.featureFlag.upsert({
        where: { key: "secrets_vault" },
        create: { key: "secrets_vault", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const off = await gql(MUT, { id: s.id, v: "x" }, await cookieFor("admin"));
      expect(off.errors).toBeDefined();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "secrets_vault" } });
      invalidateFlagCache();
    }

    // No new version was written down any of these denied paths.
    const fresh = await prisma.secret.findUniqueOrThrow({ where: { id: s.id } });
    expect(fresh.currentVersion).toBe(1);
  });
});
