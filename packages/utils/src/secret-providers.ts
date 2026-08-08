/**
 * Secret provider modules (Domain 7 P2) — pure, shared via @agentcenter/utils. Each SecretProviderKind
 * has a module that validates its non-secret config and reports health. The local/env provider is the
 * existing AES-GCM envelope; aws (AWS Secrets Manager) and vault (HashiCorp Vault KV v2) are real
 * external providers whose credentials are themselves Secrets (referenced as {secretRef:{name}}) or
 * come from the process environment (IAM chain / VAULT_TOKEN) - never inlined into config.
 *
 * This module is I/O-free: it validates + shapes requests. The actual fetch (AWS SDK / Vault HTTP)
 * lives in apps/web/src/server/services/secret-external.ts, which consumes the normalizers below.
 */
import { isSecretRef } from "./secret-refs";

export type SecretProviderKind = "env" | "aws" | "vault";

export interface ProviderValidation {
  ok: boolean;
  error: string | null;
}
export interface ProviderHealth {
  healthy: boolean;
  error: string | null;
}

export interface SecretProviderModule {
  kind: SecretProviderKind;
  /** True when a real credential resolver is wired; false = config-only stub. */
  implemented: boolean;
  validateConfig(config: Record<string, unknown>): ProviderValidation;
  healthCheck(config: Record<string, unknown>): ProviderHealth;
}

export type ConfigParse<T> = { ok: true; value: T } | { ok: false; error: string };

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * A credential field in provider config is either a {secretRef:{name}} pointer (resolved server-side
 * to a workspace Secret) or absent (fall back to the process environment). A raw inline string is
 * rejected - plaintext credentials must never live in a provider's non-secret config.
 */
function readCredentialRef(value: unknown, field: string): ConfigParse<string | undefined> {
  if (value === undefined || value === null || value === "") return { ok: true, value: undefined };
  if (isSecretRef(value)) return { ok: true, value: value.secretRef.name };
  return {
    ok: false,
    error: `${field} must be a {secretRef:{name}} pointer, not an inline value`,
  };
}

// ─── AWS Secrets Manager config ──────────────────────────────────────
export interface NormalizedAwsConfig {
  region: string;
  endpoint?: string;
  /** Prefixed onto a Secret's name to form the AWS SecretId (e.g. "prod/"). */
  secretNamePrefix: string;
  accessKeyIdRef?: string;
  secretAccessKeyRef?: string;
  sessionTokenRef?: string;
}

/** Normalize + validate an aws provider's non-secret config. Pure; credential *values* are refs. */
export function normalizeAwsSecretConfig(
  config: Record<string, unknown>,
): ConfigParse<NormalizedAwsConfig> {
  const region = asNonEmptyString(config.region);
  if (!region) return { ok: false, error: "missing required config: region" };

  const accessKeyIdRef = readCredentialRef(config.accessKeyId, "accessKeyId");
  if (!accessKeyIdRef.ok) return accessKeyIdRef;
  const secretAccessKeyRef = readCredentialRef(config.secretAccessKey, "secretAccessKey");
  if (!secretAccessKeyRef.ok) return secretAccessKeyRef;
  const sessionTokenRef = readCredentialRef(config.sessionToken, "sessionToken");
  if (!sessionTokenRef.ok) return sessionTokenRef;

  // If either half of a static key pair is given, both must be.
  if (Boolean(accessKeyIdRef.value) !== Boolean(secretAccessKeyRef.value)) {
    return {
      ok: false,
      error: "accessKeyId and secretAccessKey secret-refs must be provided together",
    };
  }

  return {
    ok: true,
    value: {
      region,
      endpoint: asNonEmptyString(config.endpoint) ?? undefined,
      secretNamePrefix: asNonEmptyString(config.secretNamePrefix) ?? "",
      accessKeyIdRef: accessKeyIdRef.value,
      secretAccessKeyRef: secretAccessKeyRef.value,
      sessionTokenRef: sessionTokenRef.value,
    },
  };
}

/** The AWS SecretId for a workspace Secret: the provider's prefix concatenated with the secret name. */
export function awsSecretIdFor(config: NormalizedAwsConfig, secretName: string): string {
  return `${config.secretNamePrefix}${secretName}`;
}

// ─── HashiCorp Vault (KV v2) config ──────────────────────────────────
export interface NormalizedVaultConfig {
  /** Base URL, e.g. https://vault.internal:8200 (no trailing slash). */
  address: string;
  /** KV v2 mount, default "secret". */
  mount: string;
  /** Path of the KV item within the mount, e.g. "app/openai". */
  path: string;
  /** Optional Vault Enterprise namespace. */
  namespace?: string;
  /** Optional field within the KV item; defaults to the Secret's name at resolve time. */
  field?: string;
  tokenRef?: string;
}

/** Normalize + validate a vault provider's non-secret config. Pure; token is a ref or VAULT_TOKEN. */
export function normalizeVaultSecretConfig(
  config: Record<string, unknown>,
): ConfigParse<NormalizedVaultConfig> {
  const address = asNonEmptyString(config.address);
  if (!address) return { ok: false, error: "missing required config: address" };
  const path = asNonEmptyString(config.path);
  if (!path) return { ok: false, error: "missing required config: path" };

  const tokenRef = readCredentialRef(config.token, "token");
  if (!tokenRef.ok) return tokenRef;

  return {
    ok: true,
    value: {
      address: address.replace(/\/+$/, ""),
      mount: asNonEmptyString(config.mount) ?? "secret",
      path: path.replace(/^\/+|\/+$/g, ""),
      namespace: asNonEmptyString(config.namespace) ?? undefined,
      field: asNonEmptyString(config.field) ?? undefined,
      tokenRef: tokenRef.value,
    },
  };
}

/** The KV v2 read URL for a vault item: `${address}/v1/${mount}/data/${path}`. */
export function vaultKvDataUrl(config: NormalizedVaultConfig): string {
  return `${config.address}/v1/${config.mount}/data/${config.path}`;
}

const envModule: SecretProviderModule = {
  kind: "env",
  implemented: true,
  validateConfig: () => ({ ok: true, error: null }), // local envelope needs no external config
  healthCheck: () => ({ healthy: true, error: null }),
};

const awsModule: SecretProviderModule = {
  kind: "aws",
  implemented: true,
  validateConfig: (config) => {
    const parsed = normalizeAwsSecretConfig(config);
    return parsed.ok ? { ok: true, error: null } : { ok: false, error: parsed.error };
  },
  healthCheck: (config) => {
    const parsed = normalizeAwsSecretConfig(config);
    if (!parsed.ok) return { healthy: false, error: parsed.error };
    // Config is well-formed. We do NOT dial AWS here (no I/O in this pure module); readiness of the
    // credential chain is proven on the first real resolve, which returns a shaped error on failure.
    return { healthy: true, error: null };
  },
};

const vaultModule: SecretProviderModule = {
  kind: "vault",
  implemented: true,
  validateConfig: (config) => {
    const parsed = normalizeVaultSecretConfig(config);
    return parsed.ok ? { ok: true, error: null } : { ok: false, error: parsed.error };
  },
  healthCheck: (config) => {
    const parsed = normalizeVaultSecretConfig(config);
    if (!parsed.ok) return { healthy: false, error: parsed.error };
    return { healthy: true, error: null };
  },
};

const MODULES: Record<SecretProviderKind, SecretProviderModule> = {
  env: envModule,
  aws: awsModule,
  vault: vaultModule,
};

export function getSecretProviderModule(kind: string): SecretProviderModule | undefined {
  return MODULES[kind as SecretProviderKind];
}

/** Pure: validate a provider's config for its kind (unknown kind → error). */
export function validateSecretProviderConfig(
  kind: string,
  config: Record<string, unknown>,
): ProviderValidation {
  const mod = getSecretProviderModule(kind);
  if (!mod) return { ok: false, error: `unknown provider kind: ${kind}` };
  return mod.validateConfig(config);
}

/** Pure: run a provider's health check (unknown kind → unhealthy). */
export function checkSecretProviderConfigHealth(
  kind: string,
  config: Record<string, unknown>,
): ProviderHealth {
  const mod = getSecretProviderModule(kind);
  if (!mod) return { healthy: false, error: `unknown provider kind: ${kind}` };
  return mod.healthCheck(config);
}
