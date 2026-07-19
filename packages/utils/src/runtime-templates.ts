/**
 * Tier D: runtime templates — how a stateless runner launches the right tool for a task.
 *
 * A runner is runtime-agnostic. Each agent/runner carries a `runtime` kind; this pure module turns
 * that kind (plus the per-task context the runner has already fetched + written to disk) into an
 * argv to spawn and the file layout the runtime expects the context bundle to be written into.
 *
 * OpenClaw stays the default; Codex / a custom argv / a raw shell command are just other kinds — no
 * engine rewrite. Kept pure + here so it is unit-testable and shared by the daemon and the server.
 */

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

function substitute(token: string, input: RuntimeRenderInput): string {
  return token
    .replace(/\{taskId\}/g, input.taskId)
    .replace(/\{taskTitle\}/g, input.taskTitle ?? "")
    .replace(/\{prompt\}/g, input.prompt ?? "")
    .replace(/\{workspaceDir\}/g, input.workspaceDir);
}

/**
 * Render the spawn plan for a runtime + task. Throws on a `custom`/`shell` kind missing its template.
 */
export function renderRuntimeCommand(
  kind: RuntimeKind,
  input: RuntimeRenderInput,
): RenderedRuntime {
  switch (kind) {
    case "openclaw":
      // OpenClaw reads the materialised agent files and runs one task cycle in the workspace.
      return {
        argv: ["openclaw", "run", "--task", input.taskId],
        cwd: input.workspaceDir,
        useShell: false,
        layout: OPENCLAW_LAYOUT,
      };
    case "codex":
      // A prompt-driven CLI: hand it the brief; it reads the repo in cwd.
      return {
        argv: ["codex", "exec", input.prompt ?? input.taskTitle ?? input.taskId],
        cwd: input.workspaceDir,
        useShell: false,
        layout: GENERIC_LAYOUT,
      };
    case "custom": {
      if (!Array.isArray(input.template) || input.template.length === 0)
        throw new Error("custom runtime requires a non-empty argv template");
      return {
        argv: input.template.map((tok) => substitute(tok, input)),
        cwd: input.workspaceDir,
        useShell: false,
        layout: GENERIC_LAYOUT,
      };
    }
    case "shell": {
      const cmd = typeof input.template === "string" ? input.template : input.template?.join(" ");
      if (!cmd) throw new Error("shell runtime requires a command template");
      return {
        argv: [substitute(cmd, input)],
        cwd: input.workspaceDir,
        useShell: true,
        layout: GENERIC_LAYOUT,
      };
    }
  }
}

/** The file layout a runtime expects, without rendering a spawn plan. */
export function runtimeLayout(kind: RuntimeKind): RuntimeLayout {
  return kind === "openclaw" ? OPENCLAW_LAYOUT : GENERIC_LAYOUT;
}
