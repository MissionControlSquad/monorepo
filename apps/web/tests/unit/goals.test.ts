import { describe, it, expect } from "vitest";
import { resolveIssueGoalId, resolveNextIssueGoalId } from "@agentcenter/utils";
import { assertNoCycle } from "@/server/services/goals";

// Epic #11: pure resolvers. Fallback cases ported verbatim from Paperclip
// `__tests__/issue-goal-fallback.test.ts`; cycle-guard cases are new (spec D3).

describe("issue goal fallback (ported)", () => {
  it("assigns the company goal when creating an issue without project or goal", () => {
    expect(resolveIssueGoalId({ projectId: null, goalId: null, defaultGoalId: "goal-1" })).toBe(
      "goal-1",
    );
  });

  it("keeps an explicit goal when creating an issue", () => {
    expect(
      resolveIssueGoalId({
        projectId: null,
        goalId: "goal-2",
        projectGoalId: "goal-3",
        defaultGoalId: "goal-1",
      }),
    ).toBe("goal-2");
  });

  it("inherits the project goal when creating a project-linked issue", () => {
    expect(
      resolveIssueGoalId({
        projectId: "project-1",
        goalId: null,
        projectGoalId: "goal-2",
        defaultGoalId: "goal-1",
      }),
    ).toBe("goal-2");
  });

  it("does not force a company goal when the project has no goal", () => {
    expect(
      resolveIssueGoalId({
        projectId: "project-1",
        goalId: null,
        projectGoalId: null,
        defaultGoalId: "goal-1",
      }),
    ).toBeNull();
  });

  it("backfills the company goal on update for legacy no-project issues", () => {
    expect(
      resolveNextIssueGoalId({
        currentProjectId: null,
        currentGoalId: null,
        currentProjectGoalId: null,
        defaultGoalId: "goal-1",
      }),
    ).toBe("goal-1");
  });

  it("switches from the company fallback to the project goal when a project is added later", () => {
    expect(
      resolveNextIssueGoalId({
        currentProjectId: null,
        currentGoalId: "goal-1",
        currentProjectGoalId: null,
        projectId: "project-1",
        goalId: null,
        projectGoalId: "goal-2",
        defaultGoalId: "goal-1",
      }),
    ).toBe("goal-2");
  });

  it("backfills the project goal for legacy project-linked issues on update", () => {
    expect(
      resolveNextIssueGoalId({
        currentProjectId: "project-1",
        currentGoalId: null,
        currentProjectGoalId: "goal-2",
        defaultGoalId: "goal-1",
      }),
    ).toBe("goal-2");
  });

  it("preserves an explicit goal across project fallback changes", () => {
    expect(
      resolveNextIssueGoalId({
        currentProjectId: "project-1",
        currentGoalId: "goal-explicit",
        currentProjectGoalId: "goal-2",
        projectId: "project-2",
        projectGoalId: "goal-3",
        defaultGoalId: "goal-1",
      }),
    ).toBe("goal-explicit");
  });
});

describe("assertNoCycle", () => {
  // tree: a → b → c (child → parent)
  const edges = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
  ];

  it("allows a valid re-parent (c under a)", () => {
    expect(() => assertNoCycle(edges, "c", "a")).not.toThrow();
  });

  it("allows clearing the parent (null)", () => {
    expect(() => assertNoCycle(edges, "b", null)).not.toThrow();
  });

  it("rejects self-parent", () => {
    expect(() => assertNoCycle(edges, "b", "b")).toThrow(/its own parent/);
  });

  it("rejects parenting a goal under its own descendant", () => {
    // a's parent would become c, but c descends from a → cycle
    expect(() => assertNoCycle(edges, "a", "c")).toThrow(/its own descendant/);
  });

  it("does not hang if the stored tree already contains a cycle", () => {
    const cyclic = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];
    expect(() => assertNoCycle(cyclic, "z", "x")).not.toThrow();
  });
});
