import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  setRunScratch,
  getRunScratch,
  listRunScratch,
  clearRunScratch,
  recordSkillSelection,
  listSkillSelections,
  writeHandoffState,
  getHandoffState,
  latestHandoffForTask,
} from "../../src/server/services/run-state";

// Parity #145/#146/#155 — per-run runtime state.
const WS = "ws_runstate";
const RUN = "run-1";

beforeEach(async () => {
  await Promise.all([
    prisma.runScratch.deleteMany({ where: { workspaceId: WS } }),
    prisma.runSkillSelection.deleteMany({ where: { workspaceId: WS } }),
    prisma.runHandoffState.deleteMany({ where: { workspaceId: WS } }),
  ]);
});

describe("run scratch (#145)", () => {
  it("upserts, reads, lists, and clears", async () => {
    await setRunScratch(WS, RUN, "step", 1);
    await setRunScratch(WS, RUN, "step", 2); // upsert
    await setRunScratch(WS, RUN, "note", "hi");
    expect(await getRunScratch(RUN, "step")).toBe(2);
    expect(await getRunScratch(RUN, "missing")).toBeNull();
    expect(await listRunScratch(RUN)).toHaveLength(2);
    expect(await clearRunScratch(RUN)).toBe(2);
  });
});

describe("runtime skill selections (#146)", () => {
  it("records selections ordered by score and validates source", async () => {
    await recordSkillSelection({
      workspaceId: WS,
      runId: RUN,
      skillId: "s1",
      source: "auto",
      score: 0.4,
    });
    await recordSkillSelection({
      workspaceId: WS,
      runId: RUN,
      skillId: "s2",
      source: "pinned",
      score: 0.9,
    });
    const sel = await listSkillSelections(RUN);
    expect(sel.map((s) => s.skillId)).toEqual(["s2", "s1"]); // score desc
    await expect(
      recordSkillSelection({ workspaceId: WS, runId: RUN, skillId: "s3", source: "bogus" }),
    ).rejects.toThrow(/source/);
  });
});

describe("successful-run handoff state (#155)", () => {
  it("writes/reads the handoff and finds the latest for a task", async () => {
    await writeHandoffState({
      workspaceId: WS,
      runId: RUN,
      taskId: "task-9",
      outcome: "success",
      summary: "did the thing",
      nextSteps: ["ship it"],
    });
    expect((await getHandoffState(RUN))?.summary).toBe("did the thing");

    // a later run on the same task supersedes as "latest"
    await writeHandoffState({
      workspaceId: WS,
      runId: "run-2",
      taskId: "task-9",
      outcome: "partial",
      summary: "more work",
    });
    expect((await latestHandoffForTask(WS, "task-9"))?.runId).toBe("run-2");

    await expect(
      writeHandoffState({ workspaceId: WS, runId: "r", outcome: "bogus", summary: "x" }),
    ).rejects.toThrow(/outcome/);
  });
});
