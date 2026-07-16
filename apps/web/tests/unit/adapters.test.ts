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
  type AdapterInvocation,
} from "@agentcenter/utils";

const base = { taskId: "t_1", workspaceDir: "/work", taskTitle: "Fix nav", prompt: "the brief" };

/** Narrow a (possibly-http) invocation to a spawn plan's argv. */
function argvOf(inv: AdapterInvocation): string[] {
  if (inv.mode !== "spawn") throw new Error("expected a spawn invocation");
  return inv.argv;
}

describe("adapter registry", () => {
  it("ships the expected built-in adapters", () => {
    expect(BUILTIN_ADAPTER_KEYS).toEqual([
      "openclaw",
      "codex",
      "claude",
      "gemini",
      "process",
      "shell",
      "http",
    ]);
    for (const k of BUILTIN_ADAPTER_KEYS) expect(isAdapterKey(k)).toBe(true);
    expect(isAdapterKey("nope")).toBe(false);
    expect(listAdapters().length).toBeGreaterThanOrEqual(6);
  });

  it("openclaw builds a run argv + openclaw layout; model flows through", () => {
    expect(argvOf(getAdapter("openclaw")!.build(base))).toEqual([
      "openclaw",
      "run",
      "--task",
      "t_1",
    ]);
    expect(argvOf(getAdapter("openclaw")!.build({ ...base, model: "claude-opus-4-8" }))).toEqual([
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
    expect(argvOf(buildAdapterInvocation("codex", { ...base, model: "o4" }))).toEqual([
      "codex",
      "exec",
      "-m",
      "o4",
      "the brief",
    ]);
    expect(argvOf(buildAdapterInvocation("claude", base))).toEqual([
      "claude",
      "--print",
      "the brief",
    ]);
    expect(argvOf(buildAdapterInvocation("gemini", { ...base, model: "gemini-2" }))).toEqual([
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
    if (proc.mode !== "spawn") throw new Error("expected spawn");
    expect(proc.argv).toEqual(["mytool", "--id", "t_1", "--model", "m1", "--dir", "/work"]);
    expect(proc.useShell).toBe(false);

    const sh = buildAdapterInvocation("shell", { ...base, template: "make run TASK={taskId}" });
    if (sh.mode !== "spawn") throw new Error("expected spawn");
    expect(sh.argv).toEqual(["make run TASK=t_1"]);
    expect(sh.useShell).toBe(true);
  });

  it("http adapter builds a webhook POST (mode: http), substituting tokens into the URL", () => {
    const inv = buildAdapterInvocation("http", {
      ...base,
      model: "m1",
      template: "https://hooks.example/run?task={taskId}&model={model}",
    });
    if (inv.mode !== "http") throw new Error("expected http mode");
    expect(inv.url).toBe("https://hooks.example/run?task=t_1&model=m1");
    expect(inv.method).toBe("POST");
    expect(JSON.parse(inv.body)).toMatchObject({ taskId: "t_1", model: "m1" });
  });

  it("spawn adapters carry mode: spawn", () => {
    const inv = buildAdapterInvocation("openclaw", base);
    expect(inv.mode).toBe("spawn");
  });

  it("http throws without a URL template; process/shell throw without a template; unknown key throws", () => {
    expect(() => buildAdapterInvocation("http", base)).toThrow(/URL/);
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
        mode: "spawn",
        argv: ["my-runtime", ctx.taskId],
        cwd: ctx.workspaceDir,
        useShell: false,
        layout: { instructionsFile: "A", skillsDir: "s", identityFile: "I", taskFile: "T" },
      }),
    };
    registerAdapter(mine);
    expect(isAdapterKey("my-runtime")).toBe(true);
    expect(argvOf(buildAdapterInvocation("my-runtime", base))).toEqual(["my-runtime", "t_1"]);
  });

  it("substituteAdapterToken replaces all tokens", () => {
    expect(substituteAdapterToken("{taskId}-{model}-{workspaceDir}", { ...base, model: "m" })).toBe(
      "t_1-m-/work",
    );
  });
});
