import { describe, it, expect } from "vitest";
import {
  renderRuntimeCommand,
  runtimeLayout,
  isRuntimeKind,
  RUNTIME_KINDS,
} from "@agentcenter/utils";

// Tier D: runtime template → argv + file layout. Pure, so unit-tested here.
const base = { taskId: "t_123", workspaceDir: "/work/repo", taskTitle: "Fix nav" };

describe("runtime-templates", () => {
  it("recognises every known runtime kind", () => {
    for (const k of RUNTIME_KINDS) expect(isRuntimeKind(k)).toBe(true);
    expect(isRuntimeKind("nonsense")).toBe(false);
  });

  it("openclaw renders a run argv in the workspace with the OpenClaw layout", () => {
    const r = renderRuntimeCommand("openclaw", base);
    expect(r.argv).toEqual(["openclaw", "run", "--task", "t_123"]);
    expect(r.cwd).toBe("/work/repo");
    expect(r.useShell).toBe(false);
    expect(r.layout.skillsDir).toBe(".openclaw/skills");
    expect(r.layout.instructionsFile).toBe("AGENTS.md");
  });

  it("codex passes the prompt to `codex exec`", () => {
    const r = renderRuntimeCommand("codex", { ...base, prompt: "do the thing" });
    expect(r.argv).toEqual(["codex", "exec", "do the thing"]);
    expect(r.useShell).toBe(false);
  });

  it("codex falls back to the title when no prompt is given", () => {
    const r = renderRuntimeCommand("codex", base);
    expect(r.argv[2]).toBe("Fix nav");
  });

  it("custom substitutes tokens into the argv template", () => {
    const r = renderRuntimeCommand("custom", {
      ...base,
      prompt: "brief",
      template: ["mytool", "--id", "{taskId}", "--dir", "{workspaceDir}", "--p", "{prompt}"],
    });
    expect(r.argv).toEqual(["mytool", "--id", "t_123", "--dir", "/work/repo", "--p", "brief"]);
    expect(r.useShell).toBe(false);
  });

  it("custom throws without a template", () => {
    expect(() => renderRuntimeCommand("custom", base)).toThrow(/template/);
  });

  it("shell runs a single command via a shell and substitutes tokens", () => {
    const r = renderRuntimeCommand("shell", { ...base, template: "make build TASK={taskId}" });
    expect(r.argv).toEqual(["make build TASK=t_123"]);
    expect(r.useShell).toBe(true);
  });

  it("shell throws without a command", () => {
    expect(() => renderRuntimeCommand("shell", base)).toThrow(/command/);
  });

  it("runtimeLayout returns the OpenClaw layout only for openclaw", () => {
    expect(runtimeLayout("openclaw").skillsDir).toBe(".openclaw/skills");
    expect(runtimeLayout("codex").skillsDir).toBe("skills");
  });
});
