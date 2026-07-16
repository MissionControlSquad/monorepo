import { describe, it, expect } from "vitest";
import {
  getAdapter,
  listAdapters,
  isAdapterKey,
  registerAdapter,
  buildAdapterInvocation,
  BUILTIN_ADAPTER_KEYS,
  substituteAdapterToken,
  type Adapter,
} from "@agentcenter/utils";

const base = { taskId: "t_1", workspaceDir: "/work", taskTitle: "Fix nav", prompt: "the brief" };

describe("adapter registry", () => {
  it("ships the expected built-in adapters", () => {
    expect(BUILTIN_ADAPTER_KEYS).toEqual([
      "openclaw",
      "codex",
      "claude",
      "gemini",
      "process",
      "shell",
    ]);
    for (const k of BUILTIN_ADAPTER_KEYS) expect(isAdapterKey(k)).toBe(true);
    expect(isAdapterKey("nope")).toBe(false);
    expect(listAdapters().length).toBeGreaterThanOrEqual(6);
  });

  it("openclaw builds a run argv + openclaw layout; model flows through", () => {
    expect(getAdapter("openclaw")!.build(base).argv).toEqual(["openclaw", "run", "--task", "t_1"]);
    expect(getAdapter("openclaw")!.build({ ...base, model: "claude-opus-4-8" }).argv).toEqual([
      "openclaw",
      "run",
      "--task",
      "t_1",
      "--model",
      "claude-opus-4-8",
    ]);
    expect(getAdapter("openclaw")!.build(base).layout.skillsDir).toBe(".openclaw/skills");
  });

  it("codex / claude / gemini pass the brief + model in their own flag style", () => {
    expect(buildAdapterInvocation("codex", { ...base, model: "o4" }).argv).toEqual([
      "codex",
      "exec",
      "-m",
      "o4",
      "the brief",
    ]);
    expect(buildAdapterInvocation("claude", base).argv).toEqual(["claude", "--print", "the brief"]);
    expect(buildAdapterInvocation("gemini", { ...base, model: "gemini-2" }).argv).toEqual([
      "gemini",
      "-m",
      "gemini-2",
      "-p",
      "the brief",
    ]);
  });

  it("process runs an arbitrary argv with token substitution; shell runs a command via a shell", () => {
    const proc = buildAdapterInvocation("process", {
      ...base,
      model: "m1",
      template: ["mytool", "--id", "{taskId}", "--model", "{model}", "--dir", "{workspaceDir}"],
    });
    expect(proc.argv).toEqual(["mytool", "--id", "t_1", "--model", "m1", "--dir", "/work"]);
    expect(proc.useShell).toBe(false);

    const sh = buildAdapterInvocation("shell", { ...base, template: "make run TASK={taskId}" });
    expect(sh.argv).toEqual(["make run TASK=t_1"]);
    expect(sh.useShell).toBe(true);
  });

  it("process/shell throw without a template; unknown key throws", () => {
    expect(() => buildAdapterInvocation("process", base)).toThrow(/template/);
    expect(() => buildAdapterInvocation("shell", base)).toThrow(/template/);
    expect(() => buildAdapterInvocation("does-not-exist", base)).toThrow(/Unknown runtime adapter/);
  });

  it("registerAdapter adds a custom adapter (the plugin seam)", () => {
    const mine: Adapter = {
      key: "my-runtime",
      displayName: "Mine",
      requiresTemplate: false,
      supportsModel: false,
      models: [],
      build: (ctx) => ({
        argv: ["my-runtime", ctx.taskId],
        cwd: ctx.workspaceDir,
        useShell: false,
        layout: { instructionsFile: "A", skillsDir: "s", identityFile: "I", taskFile: "T" },
      }),
    };
    registerAdapter(mine);
    expect(isAdapterKey("my-runtime")).toBe(true);
    expect(buildAdapterInvocation("my-runtime", base).argv).toEqual(["my-runtime", "t_1"]);
  });

  it("substituteAdapterToken replaces all tokens", () => {
    expect(substituteAdapterToken("{taskId}-{model}-{workspaceDir}", { ...base, model: "m" })).toBe(
      "t_1-m-/work",
    );
  });
});
