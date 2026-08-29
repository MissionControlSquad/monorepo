// Structured operator config (parity — deployment/CLI §3). A small, versioned, dependency-free config
// file the operator CLI reads/writes. It is an operator CONVENIENCE that renders to env; the runtime
// source of truth stays apps/web/src/server/env.ts.
//
// Precedence at runtime (highest wins):
//   1. process.env                          (what env.ts actually reads)
//   2. the deployment .env file             (onboard writes/generates this)
//   3. this operator config file            (renders to env via renderEnv(); never read at app runtime)
//
// Secrets are NEVER stored here in plaintext. Secret-bearing fields are "ref-only": they hold a
// reference (env:NAME | vault:PATH | file:PATH) that points at where the value actually lives. The
// real secret is generated/held in the .env file (mode 600). Connection strings are stored (they are
// needed to render env, same as the runner persists its apiKey) but are MASKED on every print.
//
// Pure + injectable (fs passed in) so it is fully unit-testable with no disk, DB, or network.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Bump when the on-disk shape changes; parseConfig() rejects a mismatched file so migrations are explicit. */
export const CONFIG_VERSION = 1;

/** The app server start command `run` execs by default (matches apps/web package.json + docs/TESTING.md PW_WEB_COMMAND). */
export const DEFAULT_WEB_COMMAND = "npm run start --workspace @agentcenter/web";

/** Sections, in help/print order. Kept as data so the CLI + tests stay in sync. */
export const SECTIONS = ["database", "auth", "secrets", "storage", "deployment"];

const field = (opts) => ({ ref: false, sensitive: false, kind: "string", required: false, ...opts });

/**
 * The config schema as data: section → field → descriptor.
 *   env       — the env.ts var this field renders to (source of truth at runtime).
 *   ref       — ref-only: stores a pointer (env:/vault:/file:), never a raw secret.
 *   sensitive — stored, but masked on every print (e.g. a connection string with a password).
 *   kind      — validation kind: string | pgurl | url | enum.
 *   default   — applied by defaultConfig() when absent.
 */
export const SCHEMA = {
  database: {
    pooledUrl: field({ env: "POSTGRES_PRISMA_URL", kind: "pgurl", sensitive: true, required: true }),
    directUrl: field({ env: "POSTGRES_URL_NON_POOLING", kind: "pgurl", sensitive: true, required: true }),
  },
  auth: {
    authSecretRef: field({ env: "AUTH_SECRET", ref: true, default: "env:AUTH_SECRET" }),
  },
  secrets: {
    cronSecretRef: field({ env: "CRON_SECRET", ref: true, default: "env:CRON_SECRET" }),
    encryptionKeyRef: field({ env: "SECRET_ENCRYPTION_KEY", ref: true, default: "env:SECRET_ENCRYPTION_KEY" }),
  },
  storage: {
    r2AccountId: field({ env: "R2_ACCOUNT_ID" }),
    r2AccessKeyIdRef: field({ env: "R2_ACCESS_KEY_ID", ref: true }),
    r2SecretAccessKeyRef: field({ env: "R2_SECRET_ACCESS_KEY", ref: true }),
    bucket: field({ env: "R2_BUCKET_NAME", default: "mnc" }),
    prefix: field({ env: "R2_PREFIX" }),
  },
  deployment: {
    publicUrl: field({ env: "NEXT_PUBLIC_MC_URL", kind: "url" }),
    nodeEnv: field({ env: "NODE_ENV", kind: "enum", enum: ["development", "test", "production"], default: "production" }),
    webCommand: field({ default: DEFAULT_WEB_COMMAND }),
  },
};

/** Env vars that must be present for a production boot (mirrors env.ts strict fields + the prod SECRET_ENCRYPTION_KEY check). */
export const REQUIRED_ENV_FOR_BOOT = [
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "AUTH_SECRET",
  "CRON_SECRET",
  "SECRET_ENCRYPTION_KEY",
];

/** Build a fresh config with schema defaults applied. Pure. */
export function defaultConfig() {
  const cfg = { configVersion: CONFIG_VERSION };
  for (const section of SECTIONS) {
    cfg[section] = {};
    for (const [key, spec] of Object.entries(SCHEMA[section])) {
      if (spec.default !== undefined) cfg[section][key] = spec.default;
    }
  }
  return cfg;
}

/** Look up a field descriptor, or null if section/key is unknown. Pure. */
export function fieldSpec(section, key) {
  return SCHEMA[section]?.[key] ?? null;
}

const REF_RE = /^(env|vault|file):.+/;
const PG_RE = /^postgres(ql)?:\/\/.+/;

/** Validate a single value against its field descriptor. Returns an error string, or null when valid. Pure. */
export function validateField(section, key, value) {
  const spec = fieldSpec(section, key);
  if (!spec) return `unknown field '${section}.${key}'`;
  if (value === undefined || value === null || value === "") return spec.required ? `${section}.${key} is required` : null;
  if (typeof value !== "string") return `${section}.${key} must be a string`;
  if (spec.ref && !REF_RE.test(value)) {
    return `${section}.${key} must be a reference (env:NAME | vault:PATH | file:PATH), not a raw secret value`;
  }
  if (spec.kind === "pgurl" && !PG_RE.test(value)) return `${section}.${key} must be a postgres:// connection string`;
  if (spec.kind === "url") {
    try {
      new URL(value);
    } catch {
      return `${section}.${key} must be a valid URL`;
    }
  }
  if (spec.kind === "enum" && !spec.enum.includes(value)) {
    return `${section}.${key} must be one of: ${spec.enum.join(", ")}`;
  }
  return null;
}

/** Validate a whole config object (version + every present field + no unknown sections/keys). Returns error strings. Pure. */
export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") return ["config must be an object"];
  if (config.configVersion !== CONFIG_VERSION) {
    errors.push(`configVersion ${config.configVersion ?? "(missing)"} != expected ${CONFIG_VERSION}`);
  }
  for (const [section, obj] of Object.entries(config)) {
    if (section === "configVersion") continue;
    if (!SCHEMA[section]) {
      errors.push(`unknown section '${section}'`);
      continue;
    }
    if (obj && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        const err = validateField(section, key, value);
        if (err) errors.push(err);
      }
    }
  }
  return errors;
}

/**
 * Parse raw file text into a validated config. Returns { ok:true, config } or { ok:false, errors }.
 * Rejects a wrong configVersion so version changes are an explicit, non-silent migration. Pure.
 */
export function parseConfig(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const errors = validateConfig(raw);
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: raw };
}

/** Serialize a config to the canonical on-disk JSON text (stable trailing newline). Pure. */
export function serializeConfig(config) {
  return JSON.stringify(config, null, 2) + "\n";
}

/** Set key=value pairs into a section, validating each. Returns { config, errors, applied }. Pure (clones input). */
export function setSectionValues(config, section, pairs) {
  const errors = [];
  const applied = [];
  if (!SCHEMA[section]) return { config, errors: [`unknown section '${section}'`], applied };
  const next = structuredClone(config);
  next[section] = next[section] ?? {};
  for (const [key, value] of Object.entries(pairs)) {
    const err = validateField(section, key, value);
    if (err) {
      errors.push(err);
      continue;
    }
    if (value === "" || value === undefined) delete next[section][key];
    else next[section][key] = value;
    applied.push(key);
  }
  if (errors.length) return { config, errors, applied: [] }; // all-or-nothing: reject on any error
  return { config: next, errors: [], applied };
}

/** Mask a connection string, hiding the password but keeping scheme/host/db readable. Pure. */
export function maskPgUrl(value) {
  try {
    const u = new URL(value);
    if (u.password) u.password = "***";
    return decodeURIComponent(u.toString());
  } catch {
    return maskValue(value);
  }
}

/** Generic mask for an opaque sensitive value. Pure. */
export function maskValue(value) {
  if (!value) return "";
  const s = String(value);
  if (s.length <= 6) return "••••••";
  return `${s.slice(0, 3)}••••${s.slice(-2)}`;
}

/**
 * A print-safe view of the config: sensitive fields masked, ref fields shown (a reference is safe to
 * display). Never returns a raw secret value. Pure (deep clone).
 */
export function maskConfig(config) {
  const out = structuredClone(config);
  for (const section of SECTIONS) {
    const obj = out[section];
    if (!obj || typeof obj !== "object") continue;
    for (const [key, value] of Object.entries(obj)) {
      const spec = fieldSpec(section, key);
      if (!spec || value == null) continue;
      if (spec.sensitive) obj[key] = spec.kind === "pgurl" ? maskPgUrl(value) : maskValue(value);
    }
  }
  return out;
}

/**
 * Render the config to the env vars env.ts reads. Ref-only fields are NOT rendered — their values
 * live in the env/vault they point at, not here. Returns a plain { VAR: value } map. Pure.
 */
export function renderEnv(config) {
  const out = {};
  for (const section of SECTIONS) {
    const obj = config[section];
    if (!obj) continue;
    for (const [key, value] of Object.entries(obj)) {
      const spec = fieldSpec(section, key);
      if (!spec || spec.ref || !spec.env || value == null || value === "") continue;
      out[spec.env] = value;
    }
  }
  return out;
}

// ── Disk IO (injectable) ─────────────────────────────────────────────────────────────────────────
const realIo = { readFileSync, writeFileSync, mkdirSync, existsSync };

/** Default config path: $AGENTCENTER_OPERATOR_CONFIG or <root>/.agentcenter/operator.config.json. */
export function defaultConfigPath(root = process.cwd(), env = process.env) {
  return env.AGENTCENTER_OPERATOR_CONFIG || join(root, ".agentcenter", "operator.config.json");
}

/** Load config from disk, returning defaultConfig() when the file is absent. Throws on an invalid/parse error. */
export function loadConfig(path, io = realIo) {
  if (!io.existsSync(path)) return defaultConfig();
  const parsed = parseConfig(io.readFileSync(path, "utf8"));
  if (!parsed.ok) throw new Error(`invalid operator config at ${path}:\n  ${parsed.errors.join("\n  ")}`);
  return parsed.config;
}

/** Persist config to disk (mode 600 — it can carry connection strings), creating parent dirs. */
export function saveConfig(config, path, io = realIo) {
  const errors = validateConfig(config);
  if (errors.length) throw new Error(`refusing to save invalid config:\n  ${errors.join("\n  ")}`);
  io.mkdirSync(dirname(path), { recursive: true });
  io.writeFileSync(path, serializeConfig(config), { mode: 0o600 });
}
