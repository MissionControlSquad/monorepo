import { describe, it, expect } from "vitest";
import {
  resolveEffectiveWorkspaceStrategyType,
  isUnrunnableWorktreeCombo,
  resolveExecutionWorkspaceEnvironmentId,
  resolveWorkspaceRuntimeConfig,
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

describe("resolveWorkspaceRuntimeConfig (#133/#149/#175)", () => {
  it("project_primary → clone into the base path, no isolation branch", () => {
    expect(
      resolveWorkspaceRuntimeConfig({
        strategy: "project_primary",
        runId: "r1",
        basePath: "/srv/proj/",
      }),
    ).toEqual({
      strategy: "project_primary",
      cwd: "/srv/proj",
      needsClone: true,
      branchName: null,
      isEphemeral: false,
    });
  });

  it("git_worktree → a worktree dir under .worktrees on a task-stable branch", () => {
    const cfg = resolveWorkspaceRuntimeConfig({
      strategy: "git_worktree",
      runId: "r1",
      taskId: "Fix Login Bug",
      basePath: "/srv/proj",
      branchPrefix: "agent/",
    });
    expect(cfg.cwd).toBe("/srv/proj/.worktrees/fix-login-bug");
    expect(cfg.branchName).toBe("agent/fix-login-bug");
    expect(cfg.isEphemeral).toBe(true);
    expect(cfg.needsClone).toBe(false);
  });

  it("branch identity is stable across runs of the same task (retry lands in the same place)", () => {
    const a = resolveWorkspaceRuntimeConfig({
      strategy: "git_worktree",
      runId: "r1",
      taskId: "t9",
    });
    const b = resolveWorkspaceRuntimeConfig({
      strategy: "git_worktree",
      runId: "r2",
      taskId: "t9",
    });
    expect(a.branchName).toBe(b.branchName);
    expect(a.cwd).toBe(b.cwd);
  });

  it("cloud_sandbox → clone into the sandbox workdir on a branch", () => {
    const cfg = resolveWorkspaceRuntimeConfig({
      strategy: "cloud_sandbox",
      runId: "r1",
      taskId: "t1",
    });
    expect(cfg.cwd).toBe("/workspace");
    expect(cfg.needsClone).toBe(true);
    expect(cfg.branchName).toBe("agent/t1");
  });

  it("adapter_managed → the adapter owns the dir; we record no cwd", () => {
    const cfg = resolveWorkspaceRuntimeConfig({ strategy: "adapter_managed", runId: "r1" });
    expect(cfg.cwd).toBeNull();
    expect(cfg.needsClone).toBe(false);
    expect(cfg.branchName).toBeNull();
  });

  it("falls back to the run id for the branch when there is no task", () => {
    const cfg = resolveWorkspaceRuntimeConfig({ strategy: "git_worktree", runId: "run 123!" });
    expect(cfg.branchName).toBe("agent/run-123");
  });
});
