import { describe, it, expect, vi } from "vitest";
// The operator config/env/token helpers are root .mjs scripts (siblings of scripts/operator.mjs), and
// their decision-making is pure + injectable — so they unit-test here in the runner's DB-free vitest
// home, exactly like operator-cli.test.ts. No disk, DB, or network is touched.
import {
  CONFIG_VERSION,
  SECTIONS,
  DEFAULT_WEB_COMMAND,
  defaultConfig,
  validateField,
  validateConfig,
  parseConfig,
  serializeConfig,
  setSectionValues,
  maskConfig,
  maskPgUrl,
  renderEnv,
  loadConfig,
  saveConfig,
  // @ts-expect-error — plain .mjs script, no type declarations; imported for its pure exports.
} from "../../../scripts/operator-config.mjs";
import {
  GENERATED_SECRETS,
  PROVIDED_KEYS,
  generateSecret,
  parseEnvFile,
  envMap,
  mergeEnvFile,
  planOnboardEnv,
  // @ts-expect-error — plain .mjs script, no type declarations.
} from "../../../scripts/operator-env.mjs";
import {
  TOKEN_PREFIX,
  hashToken,
  generateToken,
  verifyToken,
  redactToken,
  // @ts-expect-error — plain .mjs script, no type declarations.
} from "../../../scripts/operator-token.mjs";

// ── operator-config: schema + validation ───────────────────────────────────────────────────────
describe("operator-config - defaultConfig + validate", () => {
  it("builds a versioned config with schema defaults and validates clean", () => {
    const cfg = defaultConfig();
    expect(cfg.configVersion).toBe(CONFIG_VERSION);
    expect(cfg.deployment.webCommand).toBe(DEFAULT_WEB_COMMAND);
    expect(cfg.storage.bucket).toBe("mnc");
    expect(cfg.auth.authSecretRef).toBe("env:AUTH_SECRET");
    expect(validateConfig(cfg)).toEqual([]);
    expect(SECTIONS).toContain("database");
  });

  it("rejects a mismatched configVersion", () => {
    const cfg = { ...defaultConfig(), configVersion: 999 };
    expect(validateConfig(cfg)).toEqual([expect.stringContaining("configVersion 999")]);
  });

  it("flags an unknown section", () => {
    const cfg = { ...defaultConfig(), bogus: {} };
    expect(validateConfig(cfg)).toEqual([expect.stringContaining("unknown section 'bogus'")]);
  });
});

describe("operator-config - validateField (env.ts-style rules)", () => {
  it("requires ref-only fields to be a reference, not a raw secret", () => {
    expect(validateField("secrets", "cronSecretRef", "env:CRON_SECRET")).toBeNull();
    expect(validateField("secrets", "cronSecretRef", "vault:kv/cron")).toBeNull();
    expect(validateField("secrets", "cronSecretRef", "raw-secret")).toMatch(/must be a reference/);
  });

  it("validates postgres URLs, http URLs, and the NODE_ENV enum", () => {
    expect(validateField("database", "pooledUrl", "postgresql://u:p@h/db")).toBeNull();
    expect(validateField("database", "pooledUrl", "mysql://x")).toMatch(/postgres:\/\//);
    expect(validateField("deployment", "publicUrl", "https://app.example.com")).toBeNull();
    expect(validateField("deployment", "publicUrl", "not a url")).toMatch(/valid URL/);
    expect(validateField("deployment", "nodeEnv", "production")).toBeNull();
    expect(validateField("deployment", "nodeEnv", "staging")).toMatch(/one of/);
  });

  it("marks a required-but-empty field and unknown keys", () => {
    expect(validateField("database", "pooledUrl", "")).toMatch(/required/);
    expect(validateField("database", "nope", "x")).toMatch(/unknown field/);
  });
});

describe("operator-config - parse/serialize round-trip", () => {
  it("serializes then parses back to an equal, valid config", () => {
    const cfg = setSectionValues(defaultConfig(), "database", {
      pooledUrl: "postgresql://u:p@h/db",
      directUrl: "postgresql://u:p@h/db",
    }).config;
    const parsed = parseConfig(serializeConfig(cfg));
    expect(parsed.ok).toBe(true);
    expect(parsed.config).toEqual(cfg);
  });

  it("returns errors for invalid JSON and for a bad version", () => {
    expect(parseConfig("{not json").ok).toBe(false);
    const bad = parseConfig(JSON.stringify({ configVersion: 2 }));
    expect(bad.ok).toBe(false);
  });
});

describe("operator-config - setSectionValues (all-or-nothing)", () => {
  it("applies valid pairs and clones (input untouched)", () => {
    const base = defaultConfig();
    const { config, applied, errors } = setSectionValues(base, "storage", { r2AccountId: "acct", bucket: "b" });
    expect(errors).toEqual([]);
    expect(applied).toEqual(["r2AccountId", "bucket"]);
    expect(config.storage.r2AccountId).toBe("acct");
    expect(base.storage.r2AccountId).toBeUndefined(); // original not mutated
  });

  it("rejects the whole set if ANY value is invalid", () => {
    const base = defaultConfig();
    const res = setSectionValues(base, "database", { pooledUrl: "postgresql://ok/db", directUrl: "bad" });
    expect(res.errors.length).toBe(1);
    expect(res.config).toBe(base); // unchanged
  });

  it("unsets a field when given an empty value", () => {
    const cfg = setSectionValues(defaultConfig(), "storage", { r2AccountId: "acct" }).config;
    const cleared = setSectionValues(cfg, "storage", { r2AccountId: "" }).config;
    expect(cleared.storage.r2AccountId).toBeUndefined();
  });
});

describe("operator-config - masking + renderEnv (no secret leak)", () => {
  it("masks connection-string passwords but shows refs", () => {
    const cfg = setSectionValues(defaultConfig(), "database", {
      pooledUrl: "postgresql://user:supersecret@h:5432/db",
      directUrl: "postgresql://user:supersecret@h:5432/db",
    }).config;
    const masked = maskConfig(cfg);
    expect(masked.database.pooledUrl).not.toContain("supersecret");
    expect(masked.database.pooledUrl).toContain("h:5432/db");
    expect(masked.auth.authSecretRef).toBe("env:AUTH_SECRET"); // refs are safe to show
    expect(maskPgUrl("postgresql://u:pw@h/db")).not.toContain("pw");
  });

  it("renders env vars from stored fields, excluding ref-only secrets", () => {
    const cfg = setSectionValues(defaultConfig(), "database", {
      pooledUrl: "postgresql://u:p@h/db",
      directUrl: "postgresql://u:p@h/db2",
    }).config;
    const env = renderEnv(cfg);
    expect(env.POSTGRES_PRISMA_URL).toBe("postgresql://u:p@h/db");
    expect(env.POSTGRES_URL_NON_POOLING).toBe("postgresql://u:p@h/db2");
    expect(env.R2_BUCKET_NAME).toBe("mnc");
    // ref-only → never rendered (its value lives in env/vault, not here)
    expect(env.AUTH_SECRET).toBeUndefined();
    expect(env.CRON_SECRET).toBeUndefined();
  });
});

describe("operator-config - load/save round-trip (injected io)", () => {
  it("saves valid config then loads it back; missing file → defaults", () => {
    const store: Record<string, string> = {};
    const io = {
      existsSync: (p: string) => p in store,
      readFileSync: (p: string) => store[p],
      writeFileSync: (p: string, c: string) => {
        store[p] = c;
      },
      mkdirSync: () => {},
    };
    expect(loadConfig("/x/none.json", io)).toEqual(defaultConfig()); // absent → defaults
    const cfg = setSectionValues(defaultConfig(), "deployment", { publicUrl: "https://a.b" }).config;
    saveConfig(cfg, "/x/c.json", io);
    expect(loadConfig("/x/c.json", io)).toEqual(cfg);
  });

  it("refuses to save an invalid config", () => {
    const io = { existsSync: () => false, readFileSync: () => "", writeFileSync: vi.fn(), mkdirSync: () => {} };
    expect(() => saveConfig({ configVersion: 2 }, "/x/c.json", io)).toThrow();
    expect(io.writeFileSync).not.toHaveBeenCalled();
  });
});

// ── operator-env: onboarding value-generation + idempotency ──────────────────────────────────────
describe("operator-env - env file parse/merge", () => {
  it("parses kv pairs (stripping quotes) and preserves comments on merge", () => {
    const text = "# header\nFOO=bar\nQUOTED=\"a b\"\n";
    expect(envMap(text)).toEqual({ FOO: "bar", QUOTED: "a b" });
    const merged = mergeEnvFile(text, { FOO: "baz", NEW: "1" });
    expect(merged).toContain("# header");
    expect(merged).toContain("FOO=baz"); // updated in place
    expect(merged).toContain("NEW=1"); // appended
    expect(parseEnvFile(merged).filter((e: { type: string }) => e.type === "kv").length).toBe(3);
  });

  it("is stable on re-merge (idempotent — no duplicate keys or growing blank lines)", () => {
    const first = mergeEnvFile("", { A: "1" });
    const second = mergeEnvFile(first, { A: "1" });
    expect(second).toBe(first);
  });
});

describe("operator-env - planOnboardEnv (generate / keep / force / missing)", () => {
  const gen = () => Buffer.from("f".repeat(64), "hex"); // deterministic 32-byte secret

  it("generates the three secrets when absent and applies provided URLs", () => {
    const plan = planOnboardEnv({
      current: {},
      provided: { POSTGRES_PRISMA_URL: "postgresql://u/db", POSTGRES_URL_NON_POOLING: "postgresql://u/db" },
      gen,
    });
    expect(plan.generated.sort()).toEqual([...GENERATED_SECRETS].sort());
    for (const k of GENERATED_SECRETS) expect(plan.updates[k]).toHaveLength(64);
    expect(plan.provided.sort()).toEqual([...PROVIDED_KEYS].sort());
    expect(plan.missing).toEqual([]);
  });

  it("keeps existing non-empty values and generates nothing (idempotent re-run)", () => {
    const current = {
      AUTH_SECRET: "existing",
      CRON_SECRET: "existing",
      SECRET_ENCRYPTION_KEY: "existing",
      POSTGRES_PRISMA_URL: "postgresql://u/db",
      POSTGRES_URL_NON_POOLING: "postgresql://u/db",
    };
    const plan = planOnboardEnv({ current, provided: {}, gen });
    expect(plan.generated).toEqual([]);
    expect(plan.updates).toEqual({});
    expect(plan.kept.sort()).toEqual([...GENERATED_SECRETS, ...PROVIDED_KEYS].sort());
  });

  it("--force regenerates even existing secrets", () => {
    const plan = planOnboardEnv({ current: { AUTH_SECRET: "old" }, provided: {}, force: true, gen });
    expect(plan.generated).toContain("AUTH_SECRET");
    expect(plan.updates.AUTH_SECRET).toHaveLength(64);
  });

  it("reports missing provided keys when absent and unsupplied", () => {
    const plan = planOnboardEnv({ current: {}, provided: {}, gen });
    expect(plan.missing.sort()).toEqual([...PROVIDED_KEYS].sort());
  });

  it("generateSecret yields a hex string of 2×bytes length (real crypto)", () => {
    expect(generateSecret(16)).toHaveLength(32);
    expect(generateSecret(32)).toHaveLength(64);
    expect(generateSecret(32)).not.toBe(generateSecret(32)); // random
  });
});

// ── operator-token: mint / hash / verify (mirrors server ApiKey model) ───────────────────────────
describe("operator-token - generate / hash / verify", () => {
  it("mints an mc_-prefixed token whose hash matches and verifies", () => {
    const { plainKey, hash, keyPrefix } = generateToken();
    expect(plainKey.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(keyPrefix).toBe(plainKey.slice(0, 12));
    expect(hash).toBe(hashToken(plainKey));
    expect(verifyToken(plainKey, hash)).toBe(true);
  });

  it("hashToken is deterministic; verify rejects a wrong or empty token", () => {
    expect(hashToken("mc_abc")).toBe(hashToken("mc_abc"));
    const { plainKey, hash } = generateToken();
    expect(verifyToken(plainKey + "x", hash)).toBe(false);
    expect(verifyToken("", hash)).toBe(false);
    expect(verifyToken(plainKey, "")).toBe(false);
  });

  it("redactToken masks the tail", () => {
    expect(redactToken("mc_a1b2c3d4e")).toBe("mc_a1b2c3d4e" + "•".repeat(8));
  });
});
