/**
 * Secret provider modules (Domain 7 P2) — pure, shared via @agentcenter/utils. Each SecretProviderKind
 * has a module that validates its non-secret config and reports health. The local/env provider is
 * fully implemented (the existing AES-GCM envelope); aws/vault are stubs that validate config shape but
 * report `coming_soon` health until a real resolver lands (per the P2 rollout plan). No I/O — the
 * service runs healthCheck and persists healthy/lastCheckedAt/lastError onto SecretProviderConfig,
 * which were previously never written.
 */

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

function requireKeys(config: Record<string, unknown>, keys: string[]): ProviderValidation {
  const missing = keys.filter((k) => {
    const v = config[k];
    return v === undefined || v === null || v === "";
  });
  return missing.length
    ? { ok: false, error: `missing required config: ${missing.join(", ")}` }
    : { ok: true, error: null };
}

const envModule: SecretProviderModule = {
  kind: "env",
  implemented: true,
  validateConfig: () => ({ ok: true, error: null }), // local envelope needs no external config
  healthCheck: () => ({ healthy: true, error: null }),
};

const awsModule: SecretProviderModule = {
  kind: "aws",
  implemented: false,
  validateConfig: (config) => requireKeys(config, ["region"]),
  healthCheck: (config) => {
    const v = requireKeys(config, ["region"]);
    if (!v.ok) return { healthy: false, error: v.error };
    return { healthy: false, error: "aws provider resolution not yet implemented (coming soon)" };
  },
};

const vaultModule: SecretProviderModule = {
  kind: "vault",
  implemented: false,
  validateConfig: (config) => requireKeys(config, ["address", "path"]),
  healthCheck: (config) => {
    const v = requireKeys(config, ["address", "path"]);
    if (!v.ok) return { healthy: false, error: v.error };
    return { healthy: false, error: "vault provider resolution not yet implemented (coming soon)" };
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
