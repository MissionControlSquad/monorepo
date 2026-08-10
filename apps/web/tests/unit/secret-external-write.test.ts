import { describe, it, expect, vi } from "vitest";
import {
  writeAwsSecret,
  writeVaultSecret,
  writeExternalSecret,
  type AwsSecretsClient,
  type FetchImpl,
} from "@/server/services/secret-external";

/**
 * Provider WRITE-side (parity §3 secrets depth). Mirrors secret-providers-external.test.ts but for the
 * managed-lifecycle write path. Everything is mocked — NO live AWS/Vault call is made — so CI exercises
 * the full request mapping + error shaping deterministically. LIVE cloud calls only happen in prod when
 * the default (real) client/fetch is used against a configured provider.
 */
const vaultCreds = (map: Record<string, string>) => async (name: string) => map[name] ?? null;

function jsonResponse(status: number, body: unknown): ReturnType<FetchImpl> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("writeAwsSecret (mocked client)", () => {
  it("rotate → PutSecretValue(SecretId = prefix+name, SecretString = value)", async () => {
    const putSecretValue = vi.fn(async ({ SecretId, SecretString }) => {
      expect(SecretId).toBe("prod/OPENAI_API_KEY");
      expect(SecretString).toBe("sk-new");
      return { VersionId: "v-123" };
    });
    const client: AwsSecretsClient = { getSecretValue: async () => ({}), putSecretValue };

    const result = await writeAwsSecret({
      config: { region: "us-east-1", secretNamePrefix: "prod/" },
      secretName: "OPENAI_API_KEY",
      value: "sk-new",
      mode: "rotate",
      resolveSecret: vaultCreds({}),
      clientFactory: () => client,
    });
    expect(result).toEqual({ ok: true, version: "v-123" });
    expect(putSecretValue).toHaveBeenCalledOnce();
  });

  it("create → CreateSecret(Name, SecretString)", async () => {
    const createSecret = vi.fn(async ({ Name, SecretString }) => {
      expect(Name).toBe("NEW_SECRET");
      expect(SecretString).toBe("val");
      return { ARN: "arn:aws:secret" };
    });
    const client: AwsSecretsClient = { getSecretValue: async () => ({}), createSecret };
    const result = await writeAwsSecret({
      config: { region: "us-east-1" },
      secretName: "NEW_SECRET",
      value: "val",
      mode: "create",
      resolveSecret: vaultCreds({}),
      clientFactory: () => client,
    });
    expect(result).toEqual({ ok: true, version: "arn:aws:secret" });
  });

  it("classifies AccessDenied into a shaped access_denied error (no raw throw)", async () => {
    const client: AwsSecretsClient = {
      getSecretValue: async () => ({}),
      putSecretValue: async () => {
        const err = new Error("User is not authorized to perform secretsmanager:PutSecretValue");
        err.name = "AccessDeniedException";
        throw err;
      },
    };
    const result = await writeAwsSecret({
      config: { region: "us-east-1" },
      secretName: "SECURE",
      value: "x",
      mode: "rotate",
      resolveSecret: vaultCreds({}),
      clientFactory: () => client,
    });
    expect(result).toMatchObject({ ok: false, code: "access_denied" });
  });

  it("rejects inline credentials in config as config_invalid (no write attempted)", async () => {
    const result = await writeAwsSecret({
      config: { region: "us-east-1", secretAccessKey: "inline" },
      secretName: "X",
      value: "v",
      mode: "rotate",
      resolveSecret: vaultCreds({}),
      clientFactory: () => ({ getSecretValue: async () => ({}) }),
    });
    expect(result).toMatchObject({ ok: false, code: "config_invalid" });
  });
});

describe("writeVaultSecret (mocked fetch)", () => {
  it("POSTs the KV v2 data URL with { data: { <field>: value } } and returns the new version", async () => {
    const fetchImpl = vi.fn(
      (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
        expect(url).toBe("https://vault.internal:8200/v1/secret/data/app/openai");
        expect(init.method).toBe("POST");
        expect(init.headers["X-Vault-Token"]).toBe("s.tok");
        expect(JSON.parse(init.body!)).toEqual({ data: { OPENAI_API_KEY: "sk-vault-new" } });
        return jsonResponse(200, { data: { version: 4 } });
      },
    );
    const result = await writeVaultSecret({
      config: {
        address: "https://vault.internal:8200/",
        path: "/app/openai/",
        token: { secretRef: { name: "VAULT_TOKEN" } },
      },
      secretName: "OPENAI_API_KEY",
      value: "sk-vault-new",
      resolveSecret: vaultCreds({ VAULT_TOKEN: "s.tok" }),
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(result).toEqual({ ok: true, version: "4" });
  });

  it("maps HTTP 403 → access_denied on write", async () => {
    const result = await writeVaultSecret({
      config: { address: "https://v", path: "p", token: { secretRef: { name: "T" } } },
      secretName: "F",
      value: "v",
      resolveSecret: vaultCreds({ T: "tok" }),
      fetchImpl: (() => jsonResponse(403, { errors: ["denied"] })) as unknown as FetchImpl,
    });
    expect(result).toMatchObject({ ok: false, code: "access_denied" });
  });

  it("treats an unreachable Vault as provider_unavailable (no raw throw)", async () => {
    const result = await writeVaultSecret({
      config: { address: "https://v", path: "p", token: { secretRef: { name: "T" } } },
      secretName: "F",
      value: "v",
      resolveSecret: vaultCreds({ T: "tok" }),
      fetchImpl: (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as FetchImpl,
    });
    expect(result).toMatchObject({ ok: false, code: "provider_unavailable" });
  });
});

describe("writeExternalSecret dispatch", () => {
  it("routes aws and vault kinds to their writers (config validated per kind, no network)", async () => {
    const aws = await writeExternalSecret("aws", {
      config: {},
      secretName: "K",
      value: "v",
      mode: "rotate",
      resolveSecret: vaultCreds({}),
    });
    expect(aws).toMatchObject({ ok: false, code: "config_invalid" });

    const vault = await writeExternalSecret("vault", {
      config: {},
      secretName: "K",
      value: "v",
      mode: "rotate",
      resolveSecret: vaultCreds({}),
    });
    expect(vault).toMatchObject({ ok: false, code: "config_invalid" });
  });
});
