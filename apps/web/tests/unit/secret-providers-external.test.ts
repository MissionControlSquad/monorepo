import { describe, it, expect, vi } from "vitest";
import {
  resolveAwsSecret,
  resolveVaultSecret,
  resolveExternalSecret,
  type AwsSecretsClient,
  type FetchImpl,
} from "@/server/services/secret-external";

// A resolver over a fixed in-memory "workspace vault" of the credential secrets (never inline).
const vaultCreds = (map: Record<string, string>) => async (name: string) => map[name] ?? null;

function jsonResponse(status: number, body: unknown): ReturnType<FetchImpl> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("AWS Secrets Manager provider (mocked client)", () => {
  it("maps config → GetSecretValue(SecretId = prefix+name) → value, using IAM chain when no key refs", async () => {
    const getSecretValue = vi.fn(async ({ SecretId }: { SecretId: string }) => {
      expect(SecretId).toBe("prod/OPENAI_API_KEY");
      return { SecretString: "sk-live-123" };
    });
    const client: AwsSecretsClient = { getSecretValue };

    const result = await resolveAwsSecret({
      config: { region: "us-east-1", secretNamePrefix: "prod/" },
      secretName: "OPENAI_API_KEY",
      resolveSecret: vaultCreds({}),
      clientFactory: () => client,
    });

    expect(result).toEqual({ ok: true, value: "sk-live-123" });
    expect(getSecretValue).toHaveBeenCalledOnce();
  });

  it("resolves static access-key credentials from secret-refs and passes them to the client factory", async () => {
    const clientFactory = vi.fn((_config, credentials) => {
      expect(credentials).toEqual({
        accessKeyId: "AKIA-RESOLVED",
        secretAccessKey: "shhh-resolved",
        sessionToken: undefined,
      });
      return { getSecretValue: async () => ({ SecretString: "value-x" }) } as AwsSecretsClient;
    });

    const result = await resolveAwsSecret({
      config: {
        region: "eu-west-1",
        accessKeyId: { secretRef: { name: "AWS_ACCESS_KEY_ID" } },
        secretAccessKey: { secretRef: { name: "AWS_SECRET_ACCESS_KEY" } },
      },
      secretName: "DB_PASSWORD",
      resolveSecret: vaultCreds({
        AWS_ACCESS_KEY_ID: "AKIA-RESOLVED",
        AWS_SECRET_ACCESS_KEY: "shhh-resolved",
      }),
      clientFactory,
    });

    expect(result).toEqual({ ok: true, value: "value-x" });
    expect(clientFactory).toHaveBeenCalledOnce();
  });

  it("returns a clear missing-credentials error when a key secret-ref does not resolve", async () => {
    const result = await resolveAwsSecret({
      config: {
        region: "us-east-1",
        accessKeyId: { secretRef: { name: "AWS_ACCESS_KEY_ID" } },
        secretAccessKey: { secretRef: { name: "AWS_SECRET_ACCESS_KEY" } },
      },
      secretName: "X",
      resolveSecret: vaultCreds({ AWS_ACCESS_KEY_ID: "only-half" }),
      clientFactory: () => ({ getSecretValue: async () => ({ SecretString: "nope" }) }),
    });
    expect(result).toEqual({
      ok: false,
      code: "missing_credentials",
      error: expect.stringContaining("AWS_SECRET_ACCESS_KEY"),
    });
  });

  it("rejects inline credentials in config as a config_invalid shaped error", async () => {
    const result = await resolveAwsSecret({
      config: { region: "us-east-1", secretAccessKey: "inline-plaintext" },
      secretName: "X",
      resolveSecret: vaultCreds({}),
      clientFactory: () => ({ getSecretValue: async () => ({ SecretString: "x" }) }),
    });
    expect(result).toMatchObject({ ok: false, code: "config_invalid" });
  });

  it("classifies a ResourceNotFoundException into a shaped not_found error (no raw throw)", async () => {
    const result = await resolveAwsSecret({
      config: { region: "us-east-1" },
      secretName: "MISSING",
      resolveSecret: vaultCreds({}),
      clientFactory: () => ({
        getSecretValue: async () => {
          const err = new Error("Secrets Manager can't find the specified secret.");
          err.name = "ResourceNotFoundException";
          throw err;
        },
      }),
    });
    expect(result).toEqual({
      ok: false,
      code: "not_found",
      error: expect.stringContaining("MISSING"),
    });
  });

  it("classifies AccessDenied into a shaped access_denied error", async () => {
    const result = await resolveAwsSecret({
      config: { region: "us-east-1" },
      secretName: "SECURE",
      resolveSecret: vaultCreds({}),
      clientFactory: () => ({
        getSecretValue: async () => {
          const err = new Error("User is not authorized to perform secretsmanager:GetSecretValue");
          err.name = "AccessDeniedException";
          throw err;
        },
      }),
    });
    expect(result).toMatchObject({ ok: false, code: "access_denied" });
  });

  it("reports empty_value when the secret carries no string/binary value", async () => {
    const result = await resolveAwsSecret({
      config: { region: "us-east-1" },
      secretName: "EMPTY",
      resolveSecret: vaultCreds({}),
      clientFactory: () => ({ getSecretValue: async () => ({}) }),
    });
    expect(result).toMatchObject({ ok: false, code: "empty_value" });
  });

  it("errors on missing region (config_invalid)", async () => {
    const result = await resolveAwsSecret({
      config: {},
      secretName: "X",
      resolveSecret: vaultCreds({}),
      clientFactory: () => ({ getSecretValue: async () => ({ SecretString: "x" }) }),
    });
    expect(result).toMatchObject({
      ok: false,
      code: "config_invalid",
      error: expect.stringContaining("region"),
    });
  });
});

describe("HashiCorp Vault KV v2 provider (mocked fetch)", () => {
  it("reads the KV v2 data URL with the token and extracts the named field", async () => {
    const fetchImpl = vi.fn(
      (url: string, init: { method: string; headers: Record<string, string> }) => {
        expect(url).toBe("https://vault.internal:8200/v1/secret/data/app/openai");
        expect(init.method).toBe("GET");
        expect(init.headers["X-Vault-Token"]).toBe("s.resolved-token");
        return jsonResponse(200, {
          data: { data: { OPENAI_API_KEY: "sk-vault-9" }, metadata: {} },
        });
      },
    );

    const result = await resolveVaultSecret({
      config: {
        address: "https://vault.internal:8200/",
        path: "/app/openai/",
        token: { secretRef: { name: "VAULT_TOKEN" } },
      },
      secretName: "OPENAI_API_KEY",
      resolveSecret: vaultCreds({ VAULT_TOKEN: "s.resolved-token" }),
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });

    expect(result).toEqual({ ok: true, value: "sk-vault-9" });
  });

  it("honors a custom mount, namespace, and explicit field", async () => {
    const fetchImpl = vi.fn(
      (url: string, init: { method: string; headers: Record<string, string> }) => {
        expect(url).toBe("https://vault.internal:8200/v1/kv2/data/team/db");
        expect(init.headers["X-Vault-Namespace"]).toBe("acme");
        return jsonResponse(200, { data: { data: { password: "hunter2" } } });
      },
    );

    const result = await resolveVaultSecret({
      config: {
        address: "https://vault.internal:8200",
        mount: "kv2",
        path: "team/db",
        namespace: "acme",
        field: "password",
        token: { secretRef: { name: "VAULT_TOKEN" } },
      },
      secretName: "IGNORED_SECRET_NAME",
      resolveSecret: vaultCreds({ VAULT_TOKEN: "t" }),
      fetchImpl: fetchImpl as unknown as FetchImpl,
    });
    expect(result).toEqual({ ok: true, value: "hunter2" });
  });

  it("falls back to VAULT_TOKEN env when no token secret-ref is configured", async () => {
    const fetchImpl = vi.fn((_url: string, init: { headers: Record<string, string> }) => {
      expect(init.headers["X-Vault-Token"]).toBe("env-token");
      return jsonResponse(200, { data: { data: { FIELD: "v" } } });
    });
    const result = await resolveVaultSecret({
      config: { address: "https://v", path: "p" },
      secretName: "FIELD",
      resolveSecret: vaultCreds({}),
      fetchImpl: fetchImpl as unknown as FetchImpl,
      env: { VAULT_TOKEN: "env-token" },
    });
    expect(result).toEqual({ ok: true, value: "v" });
  });

  it("returns missing_credentials when neither a token ref nor VAULT_TOKEN is present", async () => {
    const result = await resolveVaultSecret({
      config: { address: "https://v", path: "p" },
      secretName: "FIELD",
      resolveSecret: vaultCreds({}),
      fetchImpl: (() => {
        throw new Error("fetch should not be called");
      }) as unknown as FetchImpl,
      env: {},
    });
    expect(result).toMatchObject({ ok: false, code: "missing_credentials" });
  });

  it("maps HTTP 403 → access_denied and 404 → not_found shaped errors", async () => {
    const forbidden = await resolveVaultSecret({
      config: { address: "https://v", path: "p", token: { secretRef: { name: "T" } } },
      secretName: "F",
      resolveSecret: vaultCreds({ T: "tok" }),
      fetchImpl: (() =>
        jsonResponse(403, { errors: ["permission denied"] })) as unknown as FetchImpl,
    });
    expect(forbidden).toMatchObject({ ok: false, code: "access_denied" });

    const notFound = await resolveVaultSecret({
      config: { address: "https://v", path: "p", token: { secretRef: { name: "T" } } },
      secretName: "F",
      resolveSecret: vaultCreds({ T: "tok" }),
      fetchImpl: (() => jsonResponse(404, { errors: [] })) as unknown as FetchImpl,
    });
    expect(notFound).toMatchObject({ ok: false, code: "not_found" });
  });

  it("returns not_found when the requested field is absent from the KV item", async () => {
    const result = await resolveVaultSecret({
      config: { address: "https://v", path: "p", token: { secretRef: { name: "T" } } },
      secretName: "ABSENT",
      resolveSecret: vaultCreds({ T: "tok" }),
      fetchImpl: (() =>
        jsonResponse(200, { data: { data: { OTHER: "x" } } })) as unknown as FetchImpl,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "not_found",
      error: expect.stringContaining("ABSENT"),
    });
  });

  it("treats an unreachable Vault as provider_unavailable (no raw throw)", async () => {
    const result = await resolveVaultSecret({
      config: { address: "https://v", path: "p", token: { secretRef: { name: "T" } } },
      secretName: "F",
      resolveSecret: vaultCreds({ T: "tok" }),
      fetchImpl: (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as FetchImpl,
    });
    expect(result).toMatchObject({ ok: false, code: "provider_unavailable" });
  });

  it("errors on missing required config (address/path)", async () => {
    const result = await resolveVaultSecret({
      config: { address: "https://v" },
      secretName: "F",
      resolveSecret: vaultCreds({}),
      fetchImpl: (() => jsonResponse(200, {})) as unknown as FetchImpl,
      env: { VAULT_TOKEN: "t" },
    });
    expect(result).toMatchObject({
      ok: false,
      code: "config_invalid",
      error: expect.stringContaining("path"),
    });
  });
});

describe("resolveExternalSecret dispatch", () => {
  it("routes aws and vault kinds to their resolvers (config validated per kind, no network)", async () => {
    // Bad config for each kind proves the dispatch reached the right resolver without any I/O.
    const aws = await resolveExternalSecret("aws", {
      config: {},
      secretName: "K",
      resolveSecret: vaultCreds({}),
    });
    expect(aws).toMatchObject({
      ok: false,
      code: "config_invalid",
      error: expect.stringContaining("region"),
    });

    const vault = await resolveExternalSecret("vault", {
      config: {},
      secretName: "K",
      resolveSecret: vaultCreds({}),
    });
    expect(vault).toMatchObject({ ok: false, code: "config_invalid" });
  });
});
