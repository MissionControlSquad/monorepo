import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  computeTaskOriginFingerprint,
  createTaskWithOrigin,
} from "../../src/server/services/task-origin";

// Parity Domain-8 §2.1 / G6.4 — task origin + per-origin idempotency.
const TITLE = "origin-test-task";

beforeEach(async () => {
  await prisma.task.deleteMany({ where: { title: TITLE } });
});

const baseData = { title: TITLE, description: "d", status: "inbox" as const, tags: [] };

describe("computeTaskOriginFingerprint (pure)", () => {
  it("is stable for the same origin and differs across origins", () => {
    const a = computeTaskOriginFingerprint({ originKind: "routine", keyParts: ["r1", 5] });
    const b = computeTaskOriginFingerprint({ originKind: "routine", keyParts: ["r1", 5] });
    const c = computeTaskOriginFingerprint({ originKind: "routine", keyParts: ["r1", 6] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("createTaskWithOrigin (#G6.4)", () => {
  it("dedupes a repeated origin — the autonomy cycle can't spawn duplicates", async () => {
    const first = await createTaskWithOrigin(baseData, {
      originKind: "routine",
      originRunId: "run1",
      keyParts: ["routine-A", "cycle-7"],
    });
    expect(first.deduped).toBe(false);
    expect(first.task.originKind).toBe("routine");

    const second = await createTaskWithOrigin(baseData, {
      originKind: "routine",
      originRunId: "run2",
      keyParts: ["routine-A", "cycle-7"],
    });
    expect(second.deduped).toBe(true);
    expect(second.task.id).toBe(first.task.id); // same task returned

    expect(await prisma.task.count({ where: { title: TITLE } })).toBe(1);
  });

  it("a different origin key creates a distinct task", async () => {
    await createTaskWithOrigin(baseData, { originKind: "watchdog", keyParts: ["t1"] });
    await createTaskWithOrigin(baseData, { originKind: "watchdog", keyParts: ["t2"] });
    expect(await prisma.task.count({ where: { title: TITLE } })).toBe(2);
  });

  it("enforces the recursion depth bound", async () => {
    await expect(
      createTaskWithOrigin(baseData, {
        originKind: "decomposition",
        keyParts: ["x"],
        requestDepth: 99,
      }),
    ).rejects.toThrow(/request depth/);
  });
});
