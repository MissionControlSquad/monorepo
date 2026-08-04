import { describe, it, expect, vi } from "vitest";
import {
  realizeCommands,
  cleanupCommands,
  realizeWorkspace,
  cleanupWorkspace,
  shq,
  type WorkspaceSpec,
} from "../src/workspace.js";

describe("workspace realization (parity #175)", () => {
  describe("shq (shell quoting)", () => {
    it("wraps in single quotes and escapes embedded quotes", () => {
      expect(shq("plain")).toBe("'plain'");
      expect(shq("a b")).toBe("'a b'");
      expect(shq("it's")).toBe(`'it'\\''s'`);
      // injection attempt stays inside the quotes
      expect(shq("x'; rm -rf /")).toBe(`'x'\\''; rm -rf /'`);
    });
  });

  describe("realizeCommands — project_primary", () => {
    it("shallow-clones with a branch when baseRef is given, else falls back to pull", () => {
      const cmds = realizeCommands({
        strategy: "project_primary",
        repoUrl: "https://github.com/acme/app.git",
        baseRef: "main",
        dir: "/runs/t1",
      });
      expect(cmds).toHaveLength(1);
      expect(cmds[0]).toBe(
        "git clone --depth 1 --branch 'main' 'https://github.com/acme/app.git' '/runs/t1' 2>/dev/null || (cd '/runs/t1' && git pull --ff-only)",
      );
    });

    it("omits the --branch flag when there is no baseRef", () => {
      const [cmd] = realizeCommands({
        repoUrl: "git@host:x.git",
        dir: "/runs/t2",
      });
      expect(cmd).not.toContain("--branch");
      expect(cmd).toContain("git clone --depth 1 'git@host:x.git' '/runs/t2'");
    });

    it("returns [] when there is no repo to realize", () => {
      expect(realizeCommands({ dir: "/runs/t3" })).toEqual([]);
      expect(realizeCommands({ dir: "/runs/t3", repoUrl: "" })).toEqual([]);
    });
  });

  describe("realizeCommands — git_worktree", () => {
    const spec: WorkspaceSpec = {
      strategy: "git_worktree",
      repoUrl: "https://github.com/acme/app.git",
      baseRef: "release/2.0",
      branchName: "run/abc123",
      dir: "/runs/wt1",
      cacheDir: "/cache/acme-app.git",
    };

    it("ensures a bare primary clone, fetches, and adds an isolated worktree on its own branch", () => {
      const cmds = realizeCommands(spec);
      expect(cmds).toEqual([
        "[ -d '/cache/acme-app.git' ] || git clone --bare 'https://github.com/acme/app.git' '/cache/acme-app.git'",
        "git --git-dir='/cache/acme-app.git' fetch --all --prune",
        "git --git-dir='/cache/acme-app.git' worktree add -B 'run/abc123' '/runs/wt1' 'release/2.0'",
      ]);
    });

    it("bases the worktree on HEAD when no baseRef is given", () => {
      const cmds = realizeCommands({ ...spec, baseRef: null });
      expect(cmds[2]).toContain("worktree add -B 'run/abc123' '/runs/wt1' 'HEAD'");
    });

    it("falls back to project_primary when cacheDir or branchName is missing", () => {
      const cmds = realizeCommands({ ...spec, cacheDir: null });
      expect(cmds).toHaveLength(1);
      expect(cmds[0]).toContain("git clone --depth 1");
    });
  });

  describe("cleanupCommands", () => {
    it("runs the cleanupCommand then removes the worktree (worktree strategy)", () => {
      expect(
        cleanupCommands({
          strategy: "git_worktree",
          dir: "/runs/wt1",
          cacheDir: "/cache/x.git",
          cleanupCommand: "docker compose down",
        }),
      ).toEqual([
        "cd '/runs/wt1' && docker compose down",
        "git --git-dir='/cache/x.git' worktree remove --force '/runs/wt1' 2>/dev/null || rm -rf '/runs/wt1'",
      ]);
    });

    it("project_primary only runs the cleanupCommand (dir left for reuse)", () => {
      expect(
        cleanupCommands({ strategy: "project_primary", dir: "/runs/t1", cleanupCommand: "make clean" }),
      ).toEqual(["cd '/runs/t1' && make clean"]);
    });

    it("is empty when there is nothing to tear down", () => {
      expect(cleanupCommands({ strategy: "project_primary", dir: "/runs/t1" })).toEqual([]);
    });
  });

  describe("realizeWorkspace / cleanupWorkspace runners", () => {
    it("runs each realize command in order and throws on the first failure", async () => {
      const calls: string[] = [];
      const exec = vi.fn(async (cmd: string) => {
        calls.push(cmd);
        return { exitCode: cmd.includes("fetch") ? 1 : 0, stderr: "boom" };
      });
      await expect(
        realizeWorkspace(
          {
            strategy: "git_worktree",
            repoUrl: "r",
            branchName: "b",
            cacheDir: "/c",
            dir: "/d",
          },
          exec,
        ),
      ).rejects.toThrow(/realize failed/);
      // stopped at the failing fetch — the worktree-add never ran
      expect(calls).toHaveLength(2);
      expect(calls[1]).toContain("fetch");
    });

    it("cleanup is best-effort and never throws", async () => {
      const exec = vi.fn(async () => ({ exitCode: 1, stderr: "nope" }));
      await expect(
        cleanupWorkspace(
          { strategy: "git_worktree", dir: "/d", cacheDir: "/c", cleanupCommand: "x" },
          exec,
        ),
      ).resolves.toBeUndefined();
      expect(exec).toHaveBeenCalledTimes(2);
    });
  });
});
