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

import type { TranscriptEntry } from "./adapter-transcript";
import { parseLine as parseTranscriptLine } from "./adapter-transcript";

/** A single provider quota/rate-limit window (Domain 12 GAP-2). */
export interface ProviderQuotaWindow {
  /** e.g. "requests (5h)" | "credits" | "tokens (24h)". */
  label: string;
  /** 0-100 percent of the window consumed; null when unknown. */
  usedPercent: number | null;
  /** ISO timestamp when the window resets; null when unknown. */
  resetsAt: string | null;
  /** Human display value, e.g. "1,234 / 5,000". */
  valueLabel?: string | null;
  detail?: string | null;
}

/** The result of polling one provider's quota (never throws — failures are shaped). */
export interface ProviderQuotaResult {
  provider: string;
  ok: boolean;
  windows: ProviderQuotaWindow[];
  errorFamily?: "timeout" | "provider_error" | "unsupported";
  error?: string;
}

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

// ─── Adapter-owned execution contract (Paperclip parity) ─────────────────────
// Today the sandbox seam spawns `build()`'s argv and blob-captures stdout. Paperclip adapters instead
// own an `execute()` that returns a STRUCTURED result (usage/model/exitReason/errorFamily) plus a
// per-runtime line parser turning raw stdout into typed transcript events. This is a first, clean,
// additive slice of that contract: both members are OPTIONAL, so every existing adapter keeps using the
// `build()` path unchanged. The structured derivation is PURE (no I/O) and fixture-testable.

/** A transcript event mirrors Paperclip's typed `TranscriptEntry` (assistant/tool_call/…). */
export type AdapterTranscriptEvent = TranscriptEntry;

/** Coarse run outcome — did the runtime finish cleanly, error, or run out of time? */
export type AdapterExecutionStatus = "success" | "error" | "timeout";

/** Why the run ended — the structured analog of a raw exit code (parity with Paperclip's exit reasons). */
export type AdapterExitReason =
  | "completed"
  | "error"
  | "timeout"
  | "max_turns"
  | "refusal"
  | "auth_required"
  | "unknown";

/**
 * Machine-readable failure class the control plane can act on (retry vs. surface vs. re-auth) without
 * re-parsing free-form stderr. A faithful subset of Paperclip's `AdapterExecutionErrorFamily`.
 */
export type AdapterErrorFamily =
  | "transient_upstream"
  | "provider_quota"
  | "model_refusal"
  | "auth_required"
  | "model_not_found"
  | "unknown";

/** Token/model accounting for a single run (the slice of Paperclip's `UsageSummary` we derive here). */
export interface AdapterUsage {
  tokensIn: number;
  tokensOut: number;
  model: string | null;
}

/** The captured raw output of a finished run — the input an adapter derives its structured result from. */
export interface AdapterExecutionInput {
  stdout: string;
  stderr?: string;
  exitCode: number | null;
  timedOut?: boolean;
  /** Observation time (ms epoch) stamped onto transcript events; defaults to now. */
  ts?: number;
}

/** The structured result an adapter's `execute()` returns (usage/exitReason/errorFamily/transcript). */
export interface AdapterExecutionResult {
  status: AdapterExecutionStatus;
  exitReason: AdapterExitReason;
  usage?: AdapterUsage;
  errorFamily?: AdapterErrorFamily;
  transcript?: AdapterTranscriptEvent[];
}

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
  /**
   * Optional live provider quota/rate-limit windows (Domain 12 GAP-2) — e.g. poll the provider API for
   * remaining requests/credits in the current window. Runs where the adapter can reach the provider
   * (the runner). Absent → the provider reports no quota windows. Never throws to the fan-out; the
   * service timeout-guards + shapes failures.
   */
  getQuotaWindows?(): Promise<ProviderQuotaWindow[]>;
  /**
   * Shell command that installs the runtime binary inside a fresh sandbox. The sandbox seam runs it
   * idempotently: `command -v <binName> || <installCommand>`. Omit for adapters with no binary
   * (process/shell/http). Install commands are ported from Paperclip's SANDBOX_INSTALL_COMMANDs.
   */
  installCommand?: string;
  /** The binary probed with `command -v` before installing (guards the installCommand). */
  binName?: string;
  build(ctx: AdapterContext): AdapterInvocation;
  /**
   * OPTIONAL per-runtime line parser — maps one line of the runtime's native stdout (e.g. Claude
   * stream-json) into typed transcript events, or `null` for an unrecognized/passthrough line. Mirrors
   * Paperclip's `StdoutLineParser`. Adapters without one fall back to `defaultLineParser`.
   */
  parseLine?(line: string, ts?: number): AdapterTranscriptEvent[] | null;
  /**
   * OPTIONAL structured execution — given a finished run's captured output, derive the structured
   * result (status/exitReason/usage/errorFamily/transcript). This is the additive, pure analog of
   * Paperclip's `execute()`; the sandbox seam still SPAWNS `build()`, then hands the captured output
   * here. Adapters without one keep the plain blob-capture path. Prefer `deriveAdapterExecutionResult`
   * as the shared implementation.
   */
  execute?(input: AdapterExecutionInput): AdapterExecutionResult;
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

// ─── Structured execution derivation (pure) ──────────────────────────────────
// The parse + classify + derive half of the adapter execution contract. Everything here is pure and
// fixture-testable: no process spawning, no I/O. Error-family regexes are a faithful (trimmed) port of
// Paperclip's claude-local `parse.ts` classifiers.

const CLAUDE_AUTH_REQUIRED_RE =
  /(?:not\s+logged\s+in|please\s+log\s+in|please\s+run\s+(?:`?claude\s+login`?|\/login)|login\s+required|requires\s+login|unauthorized|authentication\s+required)/i;
const CLAUDE_PROVIDER_QUOTA_RE =
  /(?:session\s+limit\s+(?:reached|exceeded)|out\s+of\s+extra\s+usage|claude\s+usage\s+limit\s+reached|5[-\s]?hour\s+limit\s+reached|weekly\s+limit\s+reached|usage\s+limit\s+reached|usage\s+cap\s+reached|servicequotaexceededexception)/i;
const CLAUDE_TRANSIENT_UPSTREAM_RE =
  /(?:rate[-\s]?limit(?:ed)?|rate_limit_error|too\s+many\s+requests|\b429\b|overloaded(?:_error)?|server\s+overloaded|service\s+unavailable|\b503\b|\b529\b|high\s+demand|try\s+again\s+later|temporarily\s+unavailable|throttl(?:ed|ing))/i;
const CLAUDE_MODEL_NOT_FOUND_RE =
  /(?:model[\s_-]*(?:not[\s_-]*found|does not exist|unknown|invalid)|unknown[\s_-]*model)/i;
const CLAUDE_REFUSAL_RE =
  /(?:\brefus(?:al|ed|es|e|ing)\b|declined\s+to\s+respond|cannot\s+assist\s+with)/i;

/**
 * Classify a blob of stdout/stderr into a machine-readable {@link AdapterErrorFamily}, or `null` when it
 * matches no known family. Checked most-specific-first so provider-quota wins over generic rate-limit.
 */
export function classifyErrorFamily(text: string): AdapterErrorFamily | null {
  if (!text) return null;
  if (CLAUDE_PROVIDER_QUOTA_RE.test(text)) return "provider_quota";
  if (CLAUDE_TRANSIENT_UPSTREAM_RE.test(text)) return "transient_upstream";
  if (CLAUDE_MODEL_NOT_FOUND_RE.test(text)) return "model_not_found";
  if (CLAUDE_AUTH_REQUIRED_RE.test(text)) return "auth_required";
  if (CLAUDE_REFUSAL_RE.test(text)) return "model_refusal";
  return null;
}

/** The default line parser used when an adapter declares no `parseLine`: the generic transcript codec. */
export function defaultLineParser(line: string, ts = Date.now()): AdapterTranscriptEvent[] | null {
  const entries = parseTranscriptLine(line, ts);
  return entries.length > 0 ? entries : null;
}

/**
 * Claude stream-json line parser (a concrete per-runtime `parseLine`). Reuses the shared transcript
 * codec, which already understands Claude's `{type:"assistant", message:{content:[…]}}` blocks, and
 * returns `null` for blank / non-JSON / unrecognized lines (Claude `system`/`result` envelopes) so
 * they pass through instead of polluting the transcript. Usage totals come from the result envelope via
 * {@link deriveAdapterExecutionResult}, not from this parser.
 */
function claudeParseLine(line: string, ts = Date.now()): AdapterTranscriptEvent[] | null {
  const entries = parseTranscriptLine(line, ts);
  if (entries.length === 0) return null;
  // A line that only yields `raw` (unknown JSON / plain text) is a passthrough → null.
  if (entries.every((e) => e.kind === "raw")) return null;
  return entries;
}

function asNum(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Extract usage/model + the terminal error/subtype from a Claude stream-json stdout blob. Scans for the
 * `system/init` envelope (model) and the terminal `result` envelope (token usage + is_error + subtype).
 * Best-effort: returns null usage when no result envelope is present.
 */
function extractClaudeOutcome(stdout: string): {
  usage: AdapterUsage | null;
  model: string | null;
  isError: boolean;
  subtype: string;
} {
  let model: string | null = null;
  let usage: AdapterUsage | null = null;
  let isError = false;
  let subtype = "";
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] !== "{") continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = typeof event.type === "string" ? event.type : "";
    if (type === "system" && event.subtype === "init" && typeof event.model === "string") {
      model = event.model;
    } else if (type === "result") {
      subtype = typeof event.subtype === "string" ? event.subtype : "";
      isError = event.is_error === true;
      const u =
        typeof event.usage === "object" && event.usage !== null
          ? (event.usage as Record<string, unknown>)
          : {};
      usage = {
        // cache-creation tokens are billed prompt tokens → count as input (mirrors Paperclip).
        tokensIn: asNum(u.input_tokens) + asNum(u.cache_creation_input_tokens),
        tokensOut: asNum(u.output_tokens),
        model: (typeof event.model === "string" && event.model) || model,
      };
    }
  }
  if (usage && !usage.model) usage.model = model;
  return { usage, model, isError, subtype };
}

/**
 * The shared, PURE structured-result derivation an adapter's `execute()` delegates to. Builds the typed
 * transcript via the adapter's `parseLine` (or {@link defaultLineParser}), extracts usage/model, and
 * classifies the outcome into a {@link AdapterExecutionResult}. No process is spawned — the sandbox seam
 * has already run the runtime and captured its output.
 */
export function deriveAdapterExecutionResult(
  adapter: Pick<Adapter, "parseLine">,
  input: AdapterExecutionInput,
): AdapterExecutionResult {
  const ts = input.ts ?? Date.now();
  const lineParser = adapter.parseLine?.bind(adapter) ?? defaultLineParser;
  const transcript: AdapterTranscriptEvent[] = [];
  for (const raw of input.stdout.split(/\r?\n/)) {
    const events = lineParser(raw, ts);
    if (events) transcript.push(...events);
  }

  const { usage, isError, subtype } = extractClaudeOutcome(input.stdout);
  const combined = `${input.stdout}\n${input.stderr ?? ""}`;
  const errorFamily = classifyErrorFamily(combined) ?? undefined;
  const timedOut = Boolean(input.timedOut);
  const maxTurns = subtype === "error_max_turns";
  const failed =
    timedOut || (input.exitCode ?? 0) !== 0 || isError || maxTurns || Boolean(errorFamily);

  const status: AdapterExecutionStatus = timedOut ? "timeout" : failed ? "error" : "success";
  const exitReason: AdapterExitReason = timedOut
    ? "timeout"
    : errorFamily === "model_refusal"
      ? "refusal"
      : errorFamily === "auth_required"
        ? "auth_required"
        : maxTurns
          ? "max_turns"
          : failed
            ? "error"
            : "completed";

  return {
    status,
    exitReason,
    ...(usage ? { usage } : {}),
    ...(errorFamily ? { errorFamily } : {}),
    transcript,
  };
}

// ─── Built-in adapters ──────────────────────────────────────────────────────

const openclawAdapter: Adapter = {
  key: "openclaw",
  displayName: "OpenClaw",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  installCommand: "npm install -g openclaw",
  binName: "openclaw",
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
  installCommand: "npm install -g @openai/codex",
  binName: "codex",
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
  installCommand: "npm install -g @anthropic-ai/claude-code",
  binName: "claude",
  build: (ctx) => ({
    argv: ["claude", "--print", ...(ctx.model ? ["--model", ctx.model] : []), brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
  // Adapter-owned execution contract (parity slice): Claude runs with stream-json output, so it gets a
  // real per-runtime line parser + structured result derivation. Other adapters keep the blob path.
  parseLine: claudeParseLine,
  execute(input) {
    return deriveAdapterExecutionResult(this, input);
  },
};

const geminiAdapter: Adapter = {
  key: "gemini",
  displayName: "Gemini CLI",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  installCommand: "npm install -g @google/gemini-cli",
  binName: "gemini",
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

// ─── Additional local-CLI runtimes (Domain 2, gap 4.8) ──────────────────────
// Ported as thin code modules mirroring the four above: build() an argv launch + an idempotent
// sandbox install (`command -v binName || installCommand`) + a model flag. Invocations follow each
// CLI's print/non-interactive form; they are best-effort mirrors of Paperclip's per-runtime adapters
// and should be reconfirmed against a live CLI when a real key lands (nothing has run for real yet).

const cursorAdapter: Adapter = {
  key: "cursor",
  displayName: "Cursor Agent",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  // The Cursor CLI installs via its own script (not npm); binary is `cursor-agent`.
  installCommand: "curl https://cursor.com/install -fsS | bash",
  binName: "cursor-agent",
  build: (ctx) => ({
    argv: ["cursor-agent", "-p", ...(ctx.model ? ["--model", ctx.model] : []), brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
};

const grokAdapter: Adapter = {
  key: "grok",
  displayName: "Grok CLI",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  installCommand: "npm install -g @vibe-kit/grok-cli",
  binName: "grok",
  build: (ctx) => ({
    argv: ["grok", "-p", ...(ctx.model ? ["--model", ctx.model] : []), brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
};

const opencodeAdapter: Adapter = {
  key: "opencode",
  displayName: "opencode",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  installCommand: "npm install -g opencode-ai",
  binName: "opencode",
  build: (ctx) => ({
    argv: ["opencode", "run", ...(ctx.model ? ["--model", ctx.model] : []), brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
};

const piAdapter: Adapter = {
  key: "pi",
  displayName: "Pi Coding Agent",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  installCommand: "npm install -g @mariozechner/pi-coding-agent",
  binName: "pi",
  build: (ctx) => ({
    argv: ["pi", "-p", ...(ctx.model ? ["--model", ctx.model] : []), brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
};

const hermesAdapter: Adapter = {
  key: "hermes",
  displayName: "Hermes",
  requiresTemplate: false,
  supportsModel: true,
  models: [],
  // Hermes CLI package name is deployment-specific; leave install unset (probe-only) until confirmed.
  binName: "hermes",
  build: (ctx) => ({
    argv: ["hermes", "run", ...(ctx.model ? ["--model", ctx.model] : []), brief(ctx)],
    mode: "spawn",
    cwd: ctx.workspaceDir,
    useShell: false,
    layout: GENERIC_LAYOUT,
  }),
};

const BUILTIN_ADAPTERS: Adapter[] = [
  openclawAdapter,
  codexAdapter,
  claudeAdapter,
  geminiAdapter,
  cursorAdapter,
  grokAdapter,
  opencodeAdapter,
  piAdapter,
  hermesAdapter,
  processAdapter,
  shellAdapter,
  httpAdapter,
];

// Adapter key aliases (Domain 2, gap 4.0): the Tier-A `AgentAdapter` DB rows and some external configs
// use different spellings than the Tier-D code keys. Resolve them to the one canonical module so an
// agent bound to e.g. "openclaw-gateway" (the seeded DB row) still runs the `openclaw` runtime.
// Both spellings are aliased: the seeded `AgentAdapter` DB rows use hyphens (`claude-local`,
// `openclaw-gateway`); some external/legacy configs use underscores. Missing hyphen forms were a bug
// — a `claude-local` agent failed to resolve its runtime module (canonicalized to identity).
const ADAPTER_KEY_ALIASES: Record<string, string> = {
  "openclaw-gateway": "openclaw",
  openclaw_gateway: "openclaw",
  "claude-local": "claude",
  claude_local: "claude",
  "codex-local": "codex",
  codex_local: "codex",
  "gemini-local": "gemini",
  gemini_local: "gemini",
  "cursor-local": "cursor",
  cursor_local: "cursor",
  "grok-local": "grok",
  grok_local: "grok",
  "opencode-local": "opencode",
  opencode_local: "opencode",
  "pi-local": "pi",
  pi_local: "pi",
  "hermes-local": "hermes",
  hermes_local: "hermes",
};

/** Canonicalize an adapter key through the alias table (identity when not aliased). */
export function canonicalAdapterKey(key: string): string {
  return ADAPTER_KEY_ALIASES[key] ?? key;
}

// ─── Registry ───────────────────────────────────────────────────────────────

const registry = new Map<string, Adapter>(BUILTIN_ADAPTERS.map((a) => [a.key, a]));

/** Register (or override) an adapter — the extensibility seam for deployment/plugin adapters. */
export function registerAdapter(adapter: Adapter): void {
  registry.set(adapter.key, adapter);
}

export function getAdapter(key: string): Adapter | undefined {
  return registry.get(key) ?? registry.get(canonicalAdapterKey(key));
}

export function listAdapters(): Adapter[] {
  return [...registry.values()];
}

export function isAdapterKey(key: string): boolean {
  return registry.has(key) || registry.has(canonicalAdapterKey(key));
}

export const BUILTIN_ADAPTER_KEYS = BUILTIN_ADAPTERS.map((a) => a.key);

/** Resolve an adapter and build its invocation, or throw a clear error if the key is unknown. */
export function buildAdapterInvocation(key: string, ctx: AdapterContext): AdapterInvocation {
  const adapter = getAdapter(key);
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
