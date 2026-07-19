/**
 * Tier D: runtime ADAPTER registry — closes the parity gap with Paperclip's adapter model.
 *
 * An adapter answers one question: "given a task's context (+ an optional model), how do I launch
 * this AI runtime, and where does its context bundle go on disk?" This generalises the earlier
 * fixed set of runtime-templates into a named, extensible registry: built-in adapters for the
 * common runtimes, generic `process`/`shell` adapters for ANY CLI, per-adapter model support, and
 * `registerAdapter` so a deployment (or a future plugin loader) can add its own — the same shape as
 * Paperclip's "if it can receive a heartbeat, it's hired." Pure + runtime-neutral, so it is shared
 * by the @agentcenter/runner daemon and the control plane.
 */

/** Where an adapter expects the context bundle materialised on disk (relative to cwd). */
export interface AdapterLayout {
  instructionsFile: string; // AGENTS.md-style
  skillsDir: string;
  identityFile: string;
  taskFile: string;
}

export interface AdapterContext {
  taskId: string;
  workspaceDir: string; // process cwd (the checked-out repo)
  taskTitle?: string;
  prompt?: string; // assembled brief for prompt-driven runtimes
  model?: string | null; // optional model override
  /** For generic `process` (argv) / `shell` (command string) adapters. */
  template?: string | string[];
}

/** Spawn a local/remote process (the common case — openclaw/codex/claude/… /process/shell). */
export interface SpawnInvocation {
  mode: "spawn";
  /** argv[0] is the executable; the rest are args. Spawn WITHOUT a shell unless useShell. */
  argv: string[];
  cwd: string;
  useShell: boolean;
  layout: AdapterLayout;
}

/** Fire an HTTP request instead of spawning — a webhook / already-running agent endpoint. */
export interface HttpInvocation {
  mode: "http";
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  layout: AdapterLayout;
}

export type AdapterInvocation = SpawnInvocation | HttpInvocation;

export interface Adapter {
  /** Stable key used in config / selection (e.g. "openclaw", "codex", "claude", "process"). */
  key: string;
  displayName: string;
  /** true → a command template MUST be supplied in ctx.template (process/shell). */
  requiresTemplate: boolean;
  /** Whether this adapter accepts a model override (surfaced in UI). */
  supportsModel: boolean;
  /** Curated known model ids (empty = any/unknown; live detection may add more). */
  models: string[];
  /**
   * Optional live model detection — e.g. shell out to the runtime's CLI to list installed models.
   * Runs on the machine that has the CLI (the runner). Falls back to `models` when absent/failing.
   */
  detectModels?(): Promise<string[]>;
  build(ctx: AdapterContext): AdapterInvocation;
}

/** Models an adapter offers: live-detected if it supports it (deduped with the curated list), else curated. */
export async function resolveAdapterModels(adapter: Adapter): Promise<string[]> {
  if (!adapter.detectModels) return adapter.models;
  try {
    const detected = await adapter.detectModels();
    return [...new Set([...detected, ...adapter.models])];
  } catch {
    return adapter.models;
  }
}

const OPENCLAW_LAYOUT: AdapterLayout = {
  instructionsFile: "AGENTS.md",
  skillsDir: ".openclaw/skills",
  identityFile: "IDENTITY.md",
  taskFile: "TASK.md",
};
const GENERIC_LAYOUT: AdapterLayout = {
  instructionsFile: "AGENTS.md",
  skillsDir: "skills",
  identityFile: "IDENTITY.md",
  taskFile: "TASK.md",
};

/** Substitute {taskId} {taskTitle} {prompt} {workspaceDir} {model} into a template token. */
export function substituteAdapterToken(token: string, ctx: AdapterContext): string {
  return token
    .replace(/\{taskId\}/g, ctx.taskId)
    .replace(/\{taskTitle\}/g, ctx.taskTitle ?? "")
    .replace(/\{prompt\}/g, ctx.prompt ?? "")
    .replace(/\{workspaceDir\}/g, ctx.workspaceDir)
    .replace(/\{model\}/g, ctx.model ?? "");
}

function brief(ctx: AdapterContext): string {
  return ctx.prompt ?? ctx.taskTitle ?? ctx.taskId;
}

// ─── Built-in adapters ──────────────────────────────────────────────────────

const openclawAdapter: Adapter = {
  key: "openclaw",
  displayName: "OpenClaw",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  build: (ctx) => ({
    argv: ["openclaw", "run", "--task", ctx.taskId, ...(ctx.model ? ["--model", ctx.model] : [])],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: OPENCLAW_LAYOUT,
  }),
};

const codexAdapter: Adapter = {
  key: "codex",
  displayName: "Codex CLI",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  build: (ctx) => ({
    argv: ["codex", "exec", ...(ctx.model ? ["-m", ctx.model] : []), brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
};

const claudeAdapter: Adapter = {
  key: "claude",
  displayName: "Claude Code",
  requiresTemplate: false,
  supportsModel: true,
  // Curated Claude model ids; a runner with the CLI can add more via detectModels (not wired here).
  models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5"],
  build: (ctx) => ({
    argv: ["claude", "--print", ...(ctx.model ? ["--model", ctx.model] : []), brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
};

const geminiAdapter: Adapter = {
  key: "gemini",
  displayName: "Gemini CLI",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  build: (ctx) => ({
    argv: ["gemini", ...(ctx.model ? ["-m", ctx.model] : []), "-p", brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
};

/** Generic: run ANY command as the agent (argv template). The Paperclip "process" adapter analog. */
const processAdapter: Adapter = {
  key: "process",
  displayName: "Custom process",
  requiresTemplate: true,
  supportsModel: false,
  models: [],
  build: (ctx) => {
    // Accept an argv array or a whitespace-separated string (the per-agent DB field is a string).
    const argv = Array.isArray(ctx.template)
      ? ctx.template
      : typeof ctx.template === "string" && ctx.template.trim()
        ? ctx.template.trim().split(/\s+/)
        : null;
    if (!argv || argv.length === 0)
      throw new Error("process adapter requires a non-empty argv/command template");
    return {
      mode: "spawn",
      argv: argv.map((tok) => substituteAdapterToken(tok, ctx)),
      cwd: ctx.workspaceDir,
      useShell: false,
      layout: GENERIC_LAYOUT,
    };
  },
};

/** Generic: run a single shell command as the agent. */
const shellAdapter: Adapter = {
  key: "shell",
  displayName: "Shell command",
  requiresTemplate: true,
  supportsModel: false,
  models: [],
  build: (ctx) => {
    const cmd = typeof ctx.template === "string" ? ctx.template : ctx.template?.join(" ");
    if (!cmd) throw new Error("shell adapter requires a command template");
    return {
      argv: [substituteAdapterToken(cmd, ctx)],
      mode: "spawn",
    cwd: ctx.workspaceDir,
      useShell: true,
      layout: GENERIC_LAYOUT,
    };
  },
};

/** Fire a webhook with the task payload — an already-running / serverless agent endpoint. */
const httpAdapter: Adapter = {
  key: "http",
  displayName: "HTTP webhook",
  requiresTemplate: true,
  supportsModel: true,
  models: [],
  build: (ctx) => {
    const url = typeof ctx.template === "string" ? ctx.template : ctx.template?.[0];
    if (!url) throw new Error("http adapter requires a webhook URL template");
    return {
      mode: "http",
      url: substituteAdapterToken(url, ctx),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: ctx.taskId,
        taskTitle: ctx.taskTitle ?? null,
        prompt: ctx.prompt ?? null,
        model: ctx.model ?? null,
      }),
      layout: GENERIC_LAYOUT,
    };
  },
};

const BUILTIN_ADAPTERS: Adapter[] = [
  openclawAdapter,
  codexAdapter,
  claudeAdapter,
  geminiAdapter,
  processAdapter,
  shellAdapter,
  httpAdapter,
];

// ─── Registry ───────────────────────────────────────────────────────────────

const registry = new Map<string, Adapter>(BUILTIN_ADAPTERS.map((a) => [a.key, a]));

/** Register (or override) an adapter — the extensibility seam for deployment/plugin adapters. */
export function registerAdapter(adapter: Adapter): void {
  registry.set(adapter.key, adapter);
}

export function getAdapter(key: string): Adapter | undefined {
  return registry.get(key);
}

export function listAdapters(): Adapter[] {
  return [...registry.values()];
}

export function isAdapterKey(key: string): boolean {
  return registry.has(key);
}

export const BUILTIN_ADAPTER_KEYS = BUILTIN_ADAPTERS.map((a) => a.key);

/** Resolve an adapter and build its invocation, or throw a clear error if the key is unknown. */
export function buildAdapterInvocation(key: string, ctx: AdapterContext): AdapterInvocation {
  const adapter = registry.get(key);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${key}`);
  return adapter.build(ctx);
}

// ─── Declarative adapter plugins ────────────────────────────────────────────
// A named adapter defined purely by data (no code) — it wraps a generic base adapter (process/shell/
// http) with a baked-in template. This is the safe, zero-code-exec analog of Paperclip's
// adapter-plugins.json: e.g. { key:"aider", base:"process", template:["aider","--message","{prompt}"] }
// registers an `aider` runtime the daemon can select, without shipping a JS module.

export interface AdapterPluginSpec {
  key: string;
  displayName?: string;
  /** Which generic adapter to wrap. */
  base: "process" | "shell" | "http";
  /** The baked argv/command/URL template (tokens substituted per task). */
  template: string | string[];
  models?: string[];
  supportsModel?: boolean;
}

export function adapterFromPluginSpec(spec: AdapterPluginSpec): Adapter {
  const baseAdapter = registry.get(spec.base);
  if (!baseAdapter) throw new Error(`plugin ${spec.key}: unknown base adapter ${spec.base}`);
  if (!spec.key || spec.template == null || (Array.isArray(spec.template) && !spec.template.length))
    throw new Error(`plugin ${spec.key || "?"}: key + non-empty template are required`);
  return {
    key: spec.key,
    displayName: spec.displayName ?? spec.key,
    requiresTemplate: false, // the template is baked into the spec
    supportsModel: spec.supportsModel ?? false,
    models: spec.models ?? [],
    build: (ctx) => baseAdapter.build({ ...ctx, template: spec.template }),
  };
}

/** Register a batch of declarative plugin adapters. Returns the keys registered. */
export function loadAdapterPlugins(specs: AdapterPluginSpec[]): string[] {
  const keys: string[] = [];
  for (const spec of specs) {
    registerAdapter(adapterFromPluginSpec(spec));
    keys.push(spec.key);
  }
  return keys;
}
