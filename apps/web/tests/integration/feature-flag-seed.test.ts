import { describe, it, expect, beforeAll } from "vitest";
import { runStartupMigrations } from "../../src/server/startup-migrations";
import { prisma } from "../../src/server/prisma";
import { FLAG_KEYS, FLAG_DEFAULTS, type FlagKey } from "@agentcenter/utils";

/**
 * Startup flag seeding — every FLAG_KEYS entry must exist as a DB row after startup, otherwise the
 * settings flag panel (which reads DB rows only) can't list newer flags and their FeatureGate is
 * unreachable. The catch-all in ensureFeatureFlags backfills the non-curated remainder as
 * user-managed at their FLAG_DEFAULTS value; this asserts that end-to-end and that it's idempotent.
 */
describe("startup feature-flag seeding", () => {
  beforeAll(async () => {
    await runStartupMigrations();
  });

  it("seeds a DB row for every FLAG_KEYS entry", async () => {
    const rows = await prisma.featureFlag.findMany({ select: { key: true } });
    const seeded = new Set(rows.map((r) => r.key));
    const missing = Object.values(FLAG_KEYS).filter((k) => !seeded.has(k));
    expect(missing).toEqual([]);
  });

  it("backfills newer flags as user-managed at their default value", async () => {
    // AGENT_COMPANIES is not in the curated list — it must come from the catch-all.
    const row = await prisma.featureFlag.findUnique({ where: { key: FLAG_KEYS.AGENT_COMPANIES } });
    expect(row).not.toBeNull();
    expect(row!.managedBy).toBe("user");
    expect(row!.enabled).toBe(FLAG_DEFAULTS[FLAG_KEYS.AGENT_COMPANIES as FlagKey]);
  });

  it("is idempotent and does not overwrite an admin's toggle", async () => {
    // Flip a catch-all flag on, re-run migrations, and confirm the state is preserved.
    await prisma.featureFlag.update({
      where: { key: FLAG_KEYS.AGENT_COMPANIES },
      data: { enabled: true },
    });
    await runStartupMigrations();
    const row = await prisma.featureFlag.findUnique({ where: { key: FLAG_KEYS.AGENT_COMPANIES } });
    expect(row!.enabled).toBe(true);
  });
});
