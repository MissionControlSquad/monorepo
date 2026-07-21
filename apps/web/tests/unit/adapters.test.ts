import { describe, it, expect } from "vitest";
import {
  getAdapter,
  listAdapters,
  isAdapterKey,
  registerAdapter,
  buildAdapterInvocation,
  BUILTIN_ADAPTER_KEYS,
  canonicalAdapterKey,
  substituteAdapterToken,
  resolveAdapterModels,
  loadAdapterPlugins,
  adapterFromPluginSpec,
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
      "cursor",
      "grok",
      "opencode",
      "pi",
      "hermes",
      "process",
      "shell",
      "http",
    ]);
    for (const k of BUILTIN_ADAPTER_KEYS) expect(isAdapterKey(k)).toBe(true);
    expect(isAdapterKey("nope")).toBe(false);
    expect(listAdapters().length).toBeGreaterThanOrEqual(12);
  });

  it("ships the newly-ported local runtimes (cursor/grok/opencode/pi/hermes) with install guards", () => {
    // cursor uses its own installer script (not npm); the rest are npm globals; hermes probe-only.
    expect(getAdapter("cursor")).toMatchObject({ binName: "cursor-agent" });
    expect(getAdapter("cursor")!.installCommand).toContain("cursor.com/install");
    expect(getAdapter("grok")!.installCommand).toContain("@vibe-kit/grok-cli");
    expect(getAdapter("opencode")!.installCommand).toContain("opencode-ai");
    expect(getAdapter("pi")!.installCommand).toContain("@mariozechner/pi-coding-agent");
    // hermes: package name deployment-specific → probe-only (binName, no install)
    expect(getAdapter("hermes")).toMatchObject({ binName: "hermes" });
    expect(getAdapter("hermes")!.installCommand).toBeUndefined();

    expect(argvOf(buildAdapterInvocation("opencode", { ...base, model: "gpt-x" }))).toEqual([
      "opencode",
      "run",
      "--model",
      "gpt-x",
      "the brief",
    ]);
    expect(argvOf(buildAdapterInvocation("cursor", base))).toEqual([
      "cursor-agent",
      "-p",
      "the brief",
    ]);
  });

  it("resolves Tier-A / *_local key aliases to the canonical code module (gap 4.0)", () => {
    // the seeded DB row key resolves to the openclaw runtime
    expect(getAdapter("openclaw-gateway")!.key).toBe("openclaw");
    expect(isAdapterKey("openclaw-gateway")).toBe(true);
    // *_local spellings map to their canonical keys
    expect(getAdapter("cursor_local")!.key).toBe("cursor");
    expect(getAdapter("claude_local")!.key).toBe("claude");
    expect(argvOf(buildAdapterInvocation("codex_local", { ...base, model: "o4" }))).toEqual([
      "codex",
      "exec",
      "-m",
      "o4",
      "the brief",
    ]);
    // an unaliased unknown key is still unknown
    expect(isAdapterKey("totally-unknown")).toBe(false);
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

  it("claude ships curated model ids", () => {
    expect(getAdapter("claude")!.models).toContain("claude-opus-4-8");
  });

  it("resolveAdapterModels: detects live + merges curated; falls back on no-hook or failure", async () => {
    const noHook: Adapter = { ...getAdapter("claude")!, key: "c1" };
    expect(await resolveAdapterModels(noHook)).toEqual(noHook.models);

    const withHook: Adapter = {
      ...getAdapter("openclaw")!,
      key: "c2",
      models: ["curated-1"],
      detectModels: async () => ["live-a", "curated-1"],
    };
    expect(await resolveAdapterModels(withHook)).toEqual(["live-a", "curated-1"]);

    const failing: Adapter = {
      ...getAdapter("openclaw")!,
      key: "c3",
      models: ["fallback"],
      detectModels: async () => {
        throw new Error("cli missing");
      },
    };
    expect(await resolveAdapterModels(failing)).toEqual(["fallback"]);
  });

  it("loadAdapterPlugins registers declarative adapters wrapping a base adapter", () => {
    const keys = loadAdapterPlugins([
      {
        key: "aider",
        base: "process",
        template: ["aider", "--message", "{prompt}"],
        models: ["gpt-x"],
      },
      { key: "notify", base: "http", template: "https://hooks.example/{taskId}" },
    ]);
    expect(keys).toEqual(["aider", "notify"]);
    expect(isAdapterKey("aider")).toBe(true);

    const aider = buildAdapterInvocation("aider", { ...base, prompt: "do it" });
    if (aider.mode !== "spawn") throw new Error("expected spawn");
    expect(aider.argv).toEqual(["aider", "--message", "do it"]);
    expect(getAdapter("aider")!.requiresTemplate).toBe(false); // template baked in
    expect(getAdapter("aider")!.models).toEqual(["gpt-x"]);

    const notify = buildAdapterInvocation("notify", base);
    if (notify.mode !== "http") throw new Error("expected http");
    expect(notify.url).toBe("https://hooks.example/t_1");
  });

  it("adapterFromPluginSpec rejects an unknown base or empty template", () => {
    expect(() => adapterFromPluginSpec({ key: "x", base: "nope" as never, template: "y" })).toThrow(
      /base/,
    );
    expect(() => adapterFromPluginSpec({ key: "x", base: "process", template: [] })).toThrow(
      /template/,
    );
  });

  it("substituteAdapterToken replaces all tokens", () => {
    expect(substituteAdapterToken("{taskId}-{model}-{workspaceDir}", { ...base, model: "m" })).toBe(
      "t_1-m-/work",
    );
  });
});

// Registry unification (parity #6): every seeded AgentAdapter DB row `type` must canonicalize to a
// registered Tier-D runtime module. The DB seeds hyphen spellings (`claude-local`, `openclaw-gateway`);
// a missing hyphen alias previously left those rows unresolvable at launch.
describe("adapter registry unification (Tier-A DB ↔ Tier-D code)", () => {
  // The exact `type` values seeded in migration 20260711140000_add_agent_adapters.
  const SEEDED_DB_ADAPTER_TYPES = [
    "openclaw-gateway",
    "claude-local",
    "codex-local",
    "cursor-local",
    "gemini-local",
    "grok-local",
    "opencode-local",
    "pi-local",
  ];

  it.each(SEEDED_DB_ADAPTER_TYPES)("resolves seeded DB adapter %s to a code module", (type) => {
    const adapter = getAdapter(type);
    expect(adapter, `DB adapter '${type}' must resolve to a Tier-D module`).toBeDefined();
    expect(BUILTIN_ADAPTER_KEYS).toContain(adapter!.key);
  });

  it("canonicalizes both hyphen and underscore DB spellings", () => {
    expect(canonicalAdapterKey("claude-local")).toBe("claude");
    expect(canonicalAdapterKey("claude_local")).toBe("claude");
    expect(canonicalAdapterKey("openclaw-gateway")).toBe("openclaw");
    expect(canonicalAdapterKey("cursor-local")).toBe("cursor");
  });

  it("leaves unknown / already-canonical keys unchanged (identity)", () => {
    expect(canonicalAdapterKey("claude")).toBe("claude");
    expect(canonicalAdapterKey("totally-unknown")).toBe("totally-unknown");
  });
});
