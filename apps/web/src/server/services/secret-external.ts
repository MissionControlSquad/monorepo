/**
 * External secret-provider resolvers (Domain 7 P2 — real backends). Fetches a Secret's value from an
 * external store instead of the local AES-GCM envelope:
 *   - aws   → AWS Secrets Manager GetSecretValue (@aws-sdk/client-secrets-manager)
 *   - vault → HashiCorp Vault KV v2 read (HTTP)
 *
 * Backend credentials are NEVER inlined in provider config: they are workspace Secrets referenced via
 * {secretRef:{name}} (resolved through the injected `resolveSecret`) or the process environment (the
 * AWS SDK default credential chain / VAULT_TOKEN). Every failure is returned as a SHAPED result -
 * raw provider errors are classified and never thrown to callers. The client/fetch is injectable so
 * the request/response mapping is unit-testable with no network.
 */
import {
  normalizeAwsSecretConfig,
  normalizeVaultSecretConfig,
  awsSecretIdFor,
  vaultKvDataUrl,
  type NormalizedAwsConfig,
} from "@agentcenter/utils";

export type ExternalErrorCode =
  | "config_invalid"
  | "missing_credentials"
  | "not_found"
  | "access_denied"
  | "empty_value"
  | "provider_unavailable"
  | "provider_error";

export type ExternalResolveResult =
  { ok: true; value: string } | { ok: false; code: ExternalErrorCode; error: string };

export type ResolveSecretFn = (name: string) => Promise<string | null>;

// ─── AWS Secrets Manager ─────────────────────────────────────────────
export interface AwsStaticCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/** The slice of the AWS SDK we depend on - injectable so tests need no real client/network. */
export interface AwsSecretsClient {
  getSecretValue(input: {
    SecretId: string;
  }): Promise<{ SecretString?: string; SecretBinary?: Uint8Array }>;
}

export type AwsClientFactory = (
  config: NormalizedAwsConfig,
  credentials?: AwsStaticCredentials,
) => Promise<AwsSecretsClient> | AwsSecretsClient;

/** Default client: lazily loads the SDK so importing this module (and its tests) needs no AWS deps. */
async function defaultAwsClientFactory(
  config: NormalizedAwsConfig,
  credentials?: AwsStaticCredentials,
): Promise<AwsSecretsClient> {
  const { SecretsManagerClient, GetSecretValueCommand } =
    await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    // No explicit credentials → the SDK default provider chain (IAM role / env / SSO) is used.
    ...(credentials ? { credentials } : {}),
  });
  return {
    getSecretValue: (input) => client.send(new GetSecretValueCommand(input)),
  };
}

function classifyAwsError(secretId: string, error: unknown): ExternalResolveResult {
  const name =
    (error as { name?: string; __type?: string })?.name ??
    (error as { __type?: string })?.__type ??
    "";
  const message = error instanceof Error ? error.message : String(error);
  if (/ResourceNotFound|NotFound/i.test(name) || /ResourceNotFound|NotFound/i.test(message)) {
    return { ok: false, code: "not_found", error: `AWS secret not found: ${secretId}` };
  }
  if (
    /AccessDenied|UnrecognizedClient|InvalidClientTokenId|not authorized/i.test(
      `${name} ${message}`,
    )
  ) {
    return { ok: false, code: "access_denied", error: `AWS denied access to ${secretId}` };
  }
  if (
    /Throttl|TooManyRequests|ETIMEDOUT|ENOTFOUND|ECONN|timeout|network/i.test(`${name} ${message}`)
  ) {
    return { ok: false, code: "provider_unavailable", error: "AWS Secrets Manager is unavailable" };
  }
  return { ok: false, code: "provider_error", error: `AWS Secrets Manager request failed` };
}

export async function resolveAwsSecret(opts: {
  config: Record<string, unknown>;
  secretName: string;
  resolveSecret: ResolveSecretFn;
  clientFactory?: AwsClientFactory;
}): Promise<ExternalResolveResult> {
  const parsed = normalizeAwsSecretConfig(opts.config);
  if (!parsed.ok) return { ok: false, code: "config_invalid", error: parsed.error };
  const config = parsed.value;

  // Static-key auth only when configured via secret-refs; otherwise the SDK default chain (IAM).
  let credentials: AwsStaticCredentials | undefined;
  if (config.accessKeyIdRef && config.secretAccessKeyRef) {
    const accessKeyId = await opts.resolveSecret(config.accessKeyIdRef);
    const secretAccessKey = await opts.resolveSecret(config.secretAccessKeyRef);
    if (!accessKeyId || !secretAccessKey) {
      return {
        ok: false,
        code: "missing_credentials",
        error: `AWS credential secret-refs did not resolve (${config.accessKeyIdRef}/${config.secretAccessKeyRef})`,
      };
    }
    const sessionToken = config.sessionTokenRef
      ? ((await opts.resolveSecret(config.sessionTokenRef)) ?? undefined)
      : undefined;
    credentials = { accessKeyId, secretAccessKey, sessionToken };
  }

  const secretId = awsSecretIdFor(config, opts.secretName);
  try {
    const client = await (opts.clientFactory ?? defaultAwsClientFactory)(config, credentials);
    const out = await client.getSecretValue({ SecretId: secretId });
    const value =
      out.SecretString ??
      (out.SecretBinary ? Buffer.from(out.SecretBinary).toString("utf8") : undefined);
    if (value == null || value === "") {
      return { ok: false, code: "empty_value", error: `AWS secret ${secretId} has no value` };
    }
    return { ok: true, value };
  } catch (error) {
    return classifyAwsError(secretId, error);
  }
}

// ─── HashiCorp Vault (KV v2) ─────────────────────────────────────────
export type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export async function resolveVaultSecret(opts: {
  config: Record<string, unknown>;
  secretName: string;
  resolveSecret: ResolveSecretFn;
  fetchImpl?: FetchImpl;
  env?: Record<string, string | undefined>;
}): Promise<ExternalResolveResult> {
  const parsed = normalizeVaultSecretConfig(opts.config);
  if (!parsed.ok) return { ok: false, code: "config_invalid", error: parsed.error };
  const config = parsed.value;

  const env = opts.env ?? process.env;
  const token = config.tokenRef
    ? await opts.resolveSecret(config.tokenRef)
    : (env.VAULT_TOKEN ?? null);
  if (!token) {
    return {
      ok: false,
      code: "missing_credentials",
      error: config.tokenRef
        ? `Vault token secret-ref did not resolve (${config.tokenRef})`
        : "Vault token missing: set config.token secret-ref or VAULT_TOKEN",
    };
  }

  const field = config.field ?? opts.secretName;
  const url = vaultKvDataUrl(config);
  const headers: Record<string, string> = { "X-Vault-Token": token };
  if (config.namespace) headers["X-Vault-Namespace"] = config.namespace;

  const doFetch: FetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  let res: Awaited<ReturnType<FetchImpl>>;
  try {
    res = await doFetch(url, { method: "GET", headers });
  } catch {
    return { ok: false, code: "provider_unavailable", error: "Vault is unreachable" };
  }

  if (!res.ok) {
    if (res.status === 403) {
      return { ok: false, code: "access_denied", error: "Vault denied the request (permission)" };
    }
    if (res.status === 404) {
      return {
        ok: false,
        code: "not_found",
        error: `Vault has no item at ${config.mount}/${config.path}`,
      };
    }
    if (res.status >= 500) {
      return { ok: false, code: "provider_unavailable", error: `Vault error (HTTP ${res.status})` };
    }
    return {
      ok: false,
      code: "provider_error",
      error: `Vault request failed (HTTP ${res.status})`,
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "provider_error", error: "Vault returned an unparseable response" };
  }

  // KV v2 wraps the payload as { data: { data: {...fields}, metadata: {...} } }.
  const data = (body as { data?: { data?: Record<string, unknown> } })?.data?.data;
  if (!data || typeof data !== "object") {
    return { ok: false, code: "provider_error", error: "Vault response was not KV v2 shaped" };
  }
  const value = data[field];
  if (value == null) {
    return {
      ok: false,
      code: "not_found",
      error: `Vault item ${config.mount}/${config.path} has no field "${field}"`,
    };
  }
  return { ok: true, value: typeof value === "string" ? value : JSON.stringify(value) };
}

/** Dispatch to the resolver for an external provider kind. `env` never resolves here (local envelope). */
export async function resolveExternalSecret(
  kind: "aws" | "vault",
  opts: {
    config: Record<string, unknown>;
    secretName: string;
    resolveSecret: ResolveSecretFn;
  },
): Promise<ExternalResolveResult> {
  if (kind === "aws") return resolveAwsSecret(opts);
  return resolveVaultSecret(opts);
}
