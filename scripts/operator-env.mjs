// Env-file + onboarding helpers (parity — deployment/CLI §3, `onboard`). Pure, dependency-free, and
// injectable so the value-generation + idempotency logic is unit-testable without touching disk.
//
// The deployment .env file is what env.ts ultimately reads. `onboard` fills it in idempotently:
// strong secrets are GENERATED when absent; existing non-empty values are NEVER clobbered unless
// --force. Connection strings can't be generated — they must be provided (flag/env/prompt).

import { randomBytes } from "node:crypto";

/** Secrets onboard generates when missing. AUTH_SECRET needs >=16, SECRET_ENCRYPTION_KEY >=32 (env.ts). */
export const GENERATED_SECRETS = ["AUTH_SECRET", "CRON_SECRET", "SECRET_ENCRYPTION_KEY"];

/** Values the operator must provide (cannot be generated). */
export const PROVIDED_KEYS = ["POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"];

/** Generate a strong random secret (hex). 32 bytes = 64 hex chars — clears both the 16- and 32-char bars. */
export function generateSecret(bytes = 32, gen = randomBytes) {
  return gen(bytes).toString("hex");
}

/**
 * Parse .env text into an ordered list of entries. Comment/blank lines are preserved as raw entries so
 * a round-trip keeps the file human-readable. Pure.
 */
export function parseEnvFile(text) {
  const entries = [];
  for (const line of (text ?? "").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (m) {
      let value = m[2].trim();
      // Strip a single layer of surrounding quotes.
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      entries.push({ type: "kv", key: m[1], value });
    } else {
      entries.push({ type: "raw", line });
    }
  }
  return entries;
}

/** Collapse parsed entries into a { KEY: value } map (last wins). Pure. */
export function envMap(text) {
  const out = {};
  for (const e of parseEnvFile(text)) if (e.type === "kv") out[e.key] = e.value;
  return out;
}

/** Quote a value for .env only when it contains whitespace or a `#`. Pure. */
function renderEnvValue(value) {
  return /[\s#]/.test(value) ? `"${value}"` : value;
}

/**
 * Merge `updates` into existing .env text: in-place for keys already present (preserving comments +
 * order), appended (under a header) for new keys. Returns the new file text. Pure.
 */
export function mergeEnvFile(originalText, updates) {
  const entries = parseEnvFile(originalText);
  const seen = new Set();
  const out = entries.map((e) => {
    if (e.type === "kv" && Object.prototype.hasOwnProperty.call(updates, e.key)) {
      seen.add(e.key);
      return { type: "kv", key: e.key, value: updates[e.key] };
    }
    return e;
  });
  const appended = Object.keys(updates).filter((k) => !seen.has(k));
  const lines = out.map((e) => (e.type === "kv" ? `${e.key}=${renderEnvValue(e.value)}` : e.line));
  // Drop trailing empty lines before appending so we don't accumulate blank gaps on re-runs.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (appended.length) {
    if (lines.length) lines.push("");
    lines.push("# ── Added by `operator onboard` ─────────────────────────────");
    for (const k of appended) lines.push(`${k}=${renderEnvValue(updates[k])}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Decide the env values onboard should write, idempotently. Pure — inject `gen` for deterministic tests.
 *   current  — existing env values (from the .env file merged with process.env).
 *   provided — operator-supplied values (flags/env), e.g. the Postgres URLs.
 *   force    — when true, regenerate/overwrite even existing non-empty values.
 * Returns { updates, generated, kept, provided, missing } where:
 *   updates   — { KEY: value } to write.
 *   generated — secret keys freshly generated this run.
 *   kept      — keys left untouched because they already had a non-empty value (and !force).
 *   missing   — PROVIDED_KEYS with no existing value and none supplied (caller must surface these).
 */
export function planOnboardEnv({ current = {}, provided = {}, force = false, gen } = {}) {
  const has = (k) => typeof current[k] === "string" && current[k].trim() !== "";
  const updates = {};
  const generated = [];
  const kept = [];
  const providedApplied = [];
  const missing = [];

  for (const key of GENERATED_SECRETS) {
    if (has(key) && !force) {
      kept.push(key);
      continue;
    }
    updates[key] = generateSecret(32, gen);
    generated.push(key);
  }

  for (const key of PROVIDED_KEYS) {
    const supplied = provided[key];
    if (has(key) && !force) {
      kept.push(key);
      continue;
    }
    if (supplied && String(supplied).trim()) {
      updates[key] = String(supplied).trim();
      providedApplied.push(key);
    } else if (!has(key)) {
      missing.push(key);
    }
  }

  // Any other operator-supplied keys (e.g. NEXT_PUBLIC_MC_URL) — set unless present and !force.
  for (const [key, value] of Object.entries(provided)) {
    if (PROVIDED_KEYS.includes(key)) continue;
    if (value == null || String(value).trim() === "") continue;
    if (has(key) && !force) {
      kept.push(key);
      continue;
    }
    updates[key] = String(value).trim();
    providedApplied.push(key);
  }

  return { updates, generated, kept, provided: providedApplied, missing };
}
