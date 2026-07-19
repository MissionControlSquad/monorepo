import { describe, it, expect } from "vitest";
import {
  resolveEffectiveWorkspaceStrategyType,
  isUnrunnableWorktreeCombo,
  resolveExecutionWorkspaceEnvironmentId,
  isWorkspaceStrategy,
} from "@agentcenter/utils";

// Tier D / Phase 3 (Plan 3): the PURE workspace-policy resolver — pure truth-tables, no DB.
describe("resolveEffectiveWorkspaceStrategyType", () => {
  it("an issue pin wins over everything", () => {
    expect(
      resolveEffectiveWorkspaceStrategyType({
        driver: "sandbox",
        projectDefaultStrategy: "project_primary",
        issuePinnedStrategy: "git_worktree",
      }),
    ).toBe("git_worktree");
  });

  it("a sandbox driver forces cloud_sandbox (absent a pin)", () => {
    expect(resolveEffectiveWorkspaceStrategyType({ driver: "sandbox" })).toBe("cloud_sandbox");
  });

  it("falls back to the project default, then project_primary", () => {
    expect(
      resolveEffectiveWorkspaceStrategyType({
        driver: "local",
        projectDefaultStrategy: "git_worktree",
      }),
    ).toBe("git_worktree");
    expect(resolveEffectiveWorkspaceStrategyType({ driver: "local" })).toBe("project_primary");
  });

  it("ignores an unknown pin/default", () => {
    expect(
      resolveEffectiveWorkspaceStrategyType({ driver: "local", issuePinnedStrategy: "bogus" }),
    ).toBe("project_primary");
  });
});

describe("isUnrunnableWorktreeCombo", () => {
  it("git_worktree with no project and no reusable workspace is unrunnable", () => {
    expect(
      isUnrunnableWorktreeCombo({
        strategy: "git_worktree",
        hasProject: false,
        hasReusableWorkspace: false,
      }),
    ).toBe(true);
  });

  it("git_worktree is runnable with a project OR a reusable workspace", () => {
    expect(
      isUnrunnableWorktreeCombo({
        strategy: "git_worktree",
        hasProject: true,
        hasReusableWorkspace: false,
      }),
    ).toBe(false);
    expect(
      isUnrunnableWorktreeCombo({
        strategy: "git_worktree",
        hasProject: false,
        hasReusableWorkspace: true,
      }),
    ).toBe(false);
  });

  it("non-worktree strategies are always runnable", () => {
    expect(
      isUnrunnableWorktreeCombo({
        strategy: "cloud_sandbox",
        hasProject: false,
        hasReusableWorkspace: false,
      }),
    ).toBe(false);
  });
});

describe("resolveExecutionWorkspaceEnvironmentId", () => {
  it("agent → instance → default precedence", () => {
    expect(
      resolveExecutionWorkspaceEnvironmentId({
        agentEnvironmentId: "a",
        instanceEnvironmentId: "i",
        defaultEnvironmentId: "d",
      }),
    ).toBe("a");
    expect(
      resolveExecutionWorkspaceEnvironmentId({
        instanceEnvironmentId: "i",
        defaultEnvironmentId: "d",
      }),
    ).toBe("i");
    expect(resolveExecutionWorkspaceEnvironmentId({ defaultEnvironmentId: "d" })).toBe("d");
    expect(resolveExecutionWorkspaceEnvironmentId({})).toBeNull();
  });
});

describe("isWorkspaceStrategy", () => {
  it("recognizes the four strategies and rejects others", () => {
    expect(isWorkspaceStrategy("cloud_sandbox")).toBe(true);
    expect(isWorkspaceStrategy("git_worktree")).toBe(true);
    expect(isWorkspaceStrategy("nope")).toBe(false);
  });
});
