import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { ensureBuiltinAdapters } from "../../src/server/adapters/registry";
import { canonicalAdapterKey, getAdapter as getCodeAdapter } from "@agentcenter/utils";

// Parity #6 — the code registry drives the DB rows (idempotent, create-if-absent).
const EXPECTED_TYPES = [
  "openclaw-gateway",
  "claude-local",
  "codex-local",
  "gemini-local",
  "cursor-local",
  "grok-local",
  "opencode-local",
  "pi-local",
  "hermes",
];

// agent_adapters is global seed data shared across all test files (the migration seeds 11 rows; it is
// never truncated by tests/setup.ts). This file wipes the table to exercise the code seeder in isolation,
// so it must SNAPSHOT the migration seed up front and RESTORE it afterwards — otherwise the table is left
// holding only the ~9 code-seeded rows and later files (e.g. adapters.test.ts, which expects the full 11)
// fail order-dependently.
let seedSnapshot: Awaited<ReturnType<typeof prisma.agentAdapter.findMany>> = [];

beforeAll(async () => {
  seedSnapshot = await prisma.agentAdapter.findMany();
});

beforeEach(async () => {
  await prisma.agentAdapter.deleteMany({});
});

afterAll(async () => {
  await prisma.agentAdapter.deleteMany({});
  if (seedSnapshot.length) {
    // Cast: findMany rows carry `configSchema: JsonValue` (nullable), which Prisma's createMany input
    // type won't accept directly. We're re-inserting the exact rows we snapshotted, so this is safe.
    await prisma.agentAdapter.createMany({ data: seedSnapshot as never[], skipDuplicates: true });
  }
});

describe("ensureBuiltinAdapters (#6)", () => {
  it("seeds a DB row for every built-in provider, each resolving to its code module", async () => {
    const created = await ensureBuiltinAdapters();
    expect(created.sort()).toEqual([...EXPECTED_TYPES].sort());

    const rows = await prisma.agentAdapter.findMany();
    expect(rows).toHaveLength(EXPECTED_TYPES.length);
    for (const row of rows) {
      // every seeded DB type canonicalizes to a registered Tier-D module
      expect(getCodeAdapter(canonicalAdapterKey(row.type))).toBeDefined();
    }
    // openclaw-gateway is the protected builtIn; the rest are opt-in providers
    expect(rows.find((r) => r.type === "openclaw-gateway")?.builtIn).toBe(true);
    expect(rows.find((r) => r.type === "claude-local")?.builtIn).toBe(false);
  });

  it("is idempotent and never overwrites an admin edit", async () => {
    await ensureBuiltinAdapters();
    // admin disables + renames a provider
    await prisma.agentAdapter.update({
      where: { type: "claude-local" },
      data: { enabled: false, displayName: "Claude (custom)" },
    });

    const createdSecondRun = await ensureBuiltinAdapters();
    expect(createdSecondRun).toEqual([]); // nothing new

    const claude = await prisma.agentAdapter.findUniqueOrThrow({ where: { type: "claude-local" } });
    expect(claude.enabled).toBe(false); // preserved
    expect(claude.displayName).toBe("Claude (custom)"); // preserved
  });

  it("derives a config schema with model/template properties from the code adapter", async () => {
    await ensureBuiltinAdapters();
    const claude = await prisma.agentAdapter.findUniqueOrThrow({ where: { type: "claude-local" } });
    const schema = claude.configSchema as { properties?: Record<string, unknown> };
    // claude supports a model → schema exposes a model field
    expect(schema.properties).toHaveProperty("model");
  });
});
