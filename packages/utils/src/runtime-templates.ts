/**
 * Tier D: runtime templates — how a stateless runner launches the right tool for a task.
 *
 * A runner is runtime-agnostic. Each agent/runner carries a `runtime` kind; this pure module turns
 * that kind (plus the per-task context the runner has already fetched + written to disk) into an
 * argv to spawn and the file layout the runtime expects the context bundle to be written into.
 *
 * OpenClaw stays the default; Codex / a custom argv / a raw shell command are just other kinds — no
 * engine rewrite. Kept pure + here so it is unit-testable and shared by the daemon and the server.
 *
 * As of the adapter-registry work this is a thin backward-compatible façade over adapters.ts — the
 * registry is the single engine; new runtimes (claude, gemini, …) + model selection live there.
 */

import { buildAdapterInvocation } from "./adapters";

export const RUNTIME_KINDS = ["openclaw", "codex", "custom", "shell"] as const;
export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

export function isRuntimeKind(v: string): v is RuntimeKind {
  return (RUNTIME_KINDS as readonly string[]).includes(v);
}

/** Where the runner should materialise the context bundle for a given runtime (relative to cwd). */
export interface RuntimeLayout {
  /** The primary instructions file the runtime reads (AGENTS.md-style). */
  instructionsFile: string;
  /** Directory the runner drops per-skill markdown into. */
  skillsDir: string;
  /** File holding the agent identity/persona. */
  identityFile: string;
  /** File holding the task brief (title + description + linked context). */
  taskFile: string;
}

export interface RuntimeRenderInput {
  taskId: string;
  /** Directory where the project repo is checked out — becomes the process cwd. */
  workspaceDir: string;
  /** Human-readable task title (used by some templates / for logging). */
  taskTitle?: string;
  /** The assembled prompt/brief text a prompt-driven runtime (codex/custom) receives. */
  prompt?: string;
  /**
   * For `custom`: an argv template. Tokens {taskId} {taskTitle} {prompt} {workspaceDir} are
   * substituted. For `shell`: the single command string to run via the shell.
   */
  template?: string | string[];
}

export interface RenderedRuntime {
  /** argv[0] is the executable; the rest are args. Spawn WITHOUT a shell (except kind `shell`). */
  argv: string[];
  /** Working directory for the spawned process. */
  cwd: string;
  /** Whether argv must be run through a shell (`shell` kind uses `sh -c`). */
  useShell: boolean;
  /** How the runner should lay out the context bundle on disk for this runtime. */
  layout: RuntimeLayout;
}

const OPENCLAW_LAYOUT: RuntimeLayout = {
  instructionsFile: "AGENTS.md",
  skillsDir: ".openclaw/skills",
  identityFile: "IDENTITY.md",
  taskFile: "TASK.md",
};

const GENERIC_LAYOUT: RuntimeLayout = {
  instructionsFile: "AGENTS.md",
  skillsDir: "skills",
  identityFile: "IDENTITY.md",
  taskFile: "TASK.md",
};


/**
 * Render the spawn plan for a runtime + task. Backward-compatible façade over the adapter registry
 * (see adapters.ts) — the four legacy kinds map to adapter keys (`custom` → the generic `process`
 * adapter). Throws on a `custom`/`shell` kind missing its template. New code should prefer
 * buildAdapterInvocation, which also supports models + additional runtimes (claude, gemini, …).
 */
export function renderRuntimeCommand(
  kind: RuntimeKind,
  input: RuntimeRenderInput,
): RenderedRuntime {
  const key = kind === "custom" ? "process" : kind;
  const inv = buildAdapterInvocation(key, {
    taskId: input.taskId,
    workspaceDir: input.workspaceDir,
    taskTitle: input.taskTitle,
    prompt: input.prompt,
    template: input.template,
  });
  return { argv: inv.argv, cwd: inv.cwd, useShell: inv.useShell, layout: inv.layout };
}

/** The file layout a runtime expects, without rendering a spawn plan. */
export function runtimeLayout(kind: RuntimeKind): RuntimeLayout {
  return kind === "openclaw" ? OPENCLAW_LAYOUT : GENERIC_LAYOUT;
}
