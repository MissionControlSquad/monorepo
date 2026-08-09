/**
 * AI runtime setup catalog + install-help selector (pure, no I/O).
 *
 * Backs the "AI Tools" setup/doctor surface: for each AI coding-agent CLI we support, this encodes how
 * to DETECT it (bin name + version args) and how to INSTALL it per OS (recommended + alternatives),
 * plus the Node.js prerequisite and official docs. The detection itself (running `command -v`) lives in
 * the server/runner; this module is the pure data + selection logic so it is trivially unit-testable and
 * shared by web + mobile + the runner.
 *
 * Install commands are sourced from each tool's official docs (see docsUrl). npm-based tools work on any
 * OS once Node.js is present; native installers / brew / winget are OS-specific.
 */

export type RuntimeOs = "macos" | "linux" | "windows";

/** How to run a machine's platform string (Node `process.platform`) into our OS enum. */
export function osFromPlatform(platform: string): RuntimeOs {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return "linux"; // linux, and any other unix-like, map to the linux instructions
}

export const RUNTIME_OSES: readonly RuntimeOs[] = ["macos", "linux", "windows"] as const;

export interface InstallMethod {
  /** Which OS this command targets. "any" = works on every OS (typically npm, needs Node). */
  os: RuntimeOs | "any";
  /** Short label, e.g. "Homebrew", "npm (global)", "Native installer". */
  label: string;
  /** The exact shell command to paste. */
  command: string;
  /** "recommended" is surfaced first; "alternative" is a fallback. */
  kind: "recommended" | "alternative";
  /** Optional one-line caveat (spaced hyphens, no em dashes). */
  note?: string;
  /** If set, this method needs the named prerequisite tool first (e.g. "node"). */
  needs?: "node";
}

export interface RuntimeToolSpec {
  /** Stable key - matches the adapter key where one exists. */
  key: string;
  displayName: string;
  /** Binary probed with `command -v` and run with versionArgs to read the version. */
  binName: string;
  versionArgs: string[];
  /** Official documentation URL. */
  docsUrl: string;
  /** One-line description of what it is. */
  summary: string;
  /** Ordered install methods (recommended-first within each OS at render time). */
  installMethods: InstallMethod[];
}

/** Node.js is the prerequisite for every npm-based CLI - modelled as its own installable tool. */
export const NODE_PREREQ: RuntimeToolSpec = {
  key: "node",
  displayName: "Node.js",
  binName: "node",
  versionArgs: ["--version"],
  docsUrl: "https://nodejs.org/en/download",
  summary: "JavaScript runtime - required for every npm-installed AI CLI.",
  installMethods: [
    {
      os: "macos",
      label: "Homebrew",
      command: "brew install node",
      kind: "recommended",
    },
    {
      os: "linux",
      label: "NodeSource (apt)",
      command:
        "curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs",
      kind: "recommended",
      note: "Debian / Ubuntu. Installs the current LTS.",
    },
    {
      os: "windows",
      label: "winget",
      command: "winget install OpenJS.NodeJS.LTS",
      kind: "recommended",
    },
    {
      os: "any",
      label: "nvm (version manager)",
      command: "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install --lts",
      kind: "alternative",
      note: "macOS / Linux / WSL. Avoids sudo and lets you switch versions.",
    },
  ],
};

/**
 * The AI coding-agent runtimes we can drive. Keys align with the adapter registry
 * (packages/utils/src/adapters.ts) so the two stay in lock-step.
 */
export const AI_RUNTIME_TOOLS: RuntimeToolSpec[] = [
  {
    key: "claude",
    displayName: "Claude Code",
    binName: "claude",
    versionArgs: ["--version"],
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/setup",
    summary: "Anthropic's agentic coding CLI.",
    installMethods: [
      {
        os: "macos",
        label: "Native installer",
        command: "curl -fsSL https://claude.ai/install.sh | bash",
        kind: "recommended",
        note: "No Node.js needed - ships a tested binary.",
      },
      {
        os: "linux",
        label: "Native installer",
        command: "curl -fsSL https://claude.ai/install.sh | bash",
        kind: "recommended",
        note: "No Node.js needed. Works on Linux and WSL.",
      },
      {
        os: "windows",
        label: "Native installer (PowerShell)",
        command: "irm https://claude.ai/install.ps1 | iex",
        kind: "recommended",
      },
      { os: "macos", label: "Homebrew", command: "brew install --cask claude-code", kind: "alternative" },
      {
        os: "windows",
        label: "winget",
        command: "winget install Anthropic.ClaudeCode",
        kind: "alternative",
      },
      {
        os: "any",
        label: "npm (global)",
        command: "npm install -g @anthropic-ai/claude-code",
        kind: "alternative",
        needs: "node",
        note: "Legacy path - needs Node.js 22+. Do not run with sudo.",
      },
    ],
  },
  {
    key: "codex",
    displayName: "Codex CLI",
    binName: "codex",
    versionArgs: ["--version"],
    docsUrl: "https://github.com/openai/codex",
    summary: "OpenAI's terminal coding agent.",
    installMethods: [
      {
        os: "any",
        label: "npm (global)",
        command: "npm install -g @openai/codex",
        kind: "recommended",
        needs: "node",
        note: "Use the scoped @openai/codex - the unscoped `codex` is an unrelated package.",
      },
      { os: "macos", label: "Homebrew", command: "brew install --cask codex", kind: "alternative" },
    ],
  },
  {
    key: "gemini",
    displayName: "Gemini CLI",
    binName: "gemini",
    versionArgs: ["--version"],
    docsUrl: "https://github.com/google-gemini/gemini-cli",
    summary: "Google's open-source Gemini terminal agent.",
    installMethods: [
      {
        os: "any",
        label: "npm (global)",
        command: "npm install -g @google/gemini-cli",
        kind: "recommended",
        needs: "node",
        note: "Needs Node.js 20+.",
      },
      {
        os: "macos",
        label: "Homebrew",
        command: "brew install gemini-cli",
        kind: "alternative",
      },
      {
        os: "linux",
        label: "Homebrew",
        command: "brew install gemini-cli",
        kind: "alternative",
      },
      {
        os: "any",
        label: "Run without installing (npx)",
        command: "npx @google/gemini-cli",
        kind: "alternative",
        needs: "node",
      },
    ],
  },
  {
    key: "cursor",
    displayName: "Cursor Agent",
    binName: "cursor-agent",
    versionArgs: ["--version"],
    docsUrl: "https://cursor.com/docs/cli/installation",
    summary: "Cursor's terminal agent (cursor-agent).",
    installMethods: [
      {
        os: "macos",
        label: "Install script",
        command: "curl https://cursor.com/install -fsS | bash",
        kind: "recommended",
        note: "Binary lands in ~/.local/bin - add it to PATH if needed.",
      },
      {
        os: "linux",
        label: "Install script",
        command: "curl https://cursor.com/install -fsS | bash",
        kind: "recommended",
        note: "Binary lands in ~/.local/bin - add it to PATH if needed.",
      },
      {
        os: "windows",
        label: "WSL",
        command: "wsl -e bash -lc 'curl https://cursor.com/install -fsS | bash'",
        kind: "recommended",
        note: "The Cursor CLI targets Unix - run it under WSL on Windows.",
      },
    ],
  },
  {
    key: "opencode",
    displayName: "opencode",
    binName: "opencode",
    versionArgs: ["--version"],
    docsUrl: "https://opencode.ai/docs",
    summary: "Open-source terminal coding agent.",
    installMethods: [
      {
        os: "macos",
        label: "Install script",
        command: "curl -fsSL https://opencode.ai/install | bash",
        kind: "recommended",
      },
      {
        os: "linux",
        label: "Install script",
        command: "curl -fsSL https://opencode.ai/install | bash",
        kind: "recommended",
      },
      {
        os: "any",
        label: "npm (global)",
        command: "npm install -g opencode-ai",
        kind: "alternative",
        needs: "node",
      },
      {
        os: "windows",
        label: "npm (global)",
        command: "npm install -g opencode-ai",
        kind: "recommended",
        needs: "node",
      },
    ],
  },
  {
    key: "grok",
    displayName: "Grok CLI",
    binName: "grok",
    versionArgs: ["--version"],
    docsUrl: "https://www.npmjs.com/package/@vibe-kit/grok-cli",
    summary: "Community Grok terminal agent.",
    installMethods: [
      {
        os: "any",
        label: "npm (global)",
        command: "npm install -g @vibe-kit/grok-cli",
        kind: "recommended",
        needs: "node",
      },
    ],
  },
  {
    key: "pi",
    displayName: "Pi Coding Agent",
    binName: "pi",
    versionArgs: ["--version"],
    docsUrl: "https://www.npmjs.com/package/@mariozechner/pi-coding-agent",
    summary: "Pi terminal coding agent.",
    installMethods: [
      {
        os: "any",
        label: "npm (global)",
        command: "npm install -g @mariozechner/pi-coding-agent",
        kind: "recommended",
        needs: "node",
      },
    ],
  },
  {
    key: "openclaw",
    displayName: "OpenClaw",
    binName: "openclaw",
    versionArgs: ["--version"],
    docsUrl: "https://www.npmjs.com/package/openclaw",
    summary: "OpenClaw terminal agent.",
    installMethods: [
      {
        os: "any",
        label: "npm (global)",
        command: "npm install -g openclaw",
        kind: "recommended",
        needs: "node",
      },
    ],
  },
];

/** Look up a tool spec by key. */
export function getRuntimeTool(key: string): RuntimeToolSpec | undefined {
  return AI_RUNTIME_TOOLS.find((t) => t.key === key);
}

/**
 * Ordered install methods for a tool on a given OS: OS-specific first (recommended before alternative),
 * then the "any" methods. This is what the UI renders as the copy-paste help.
 */
export function installMethodsFor(tool: RuntimeToolSpec, os: RuntimeOs): InstallMethod[] {
  const rank = (m: InstallMethod) =>
    (m.os === os ? 0 : m.os === "any" ? 1 : 2) * 2 + (m.kind === "recommended" ? 0 : 1);
  return tool.installMethods
    .filter((m) => m.os === os || m.os === "any")
    .sort((a, b) => rank(a) - rank(b));
}

/** The single best (recommended) install command for a tool on an OS, or null if none applies. */
export function recommendedInstall(tool: RuntimeToolSpec, os: RuntimeOs): InstallMethod | null {
  return installMethodsFor(tool, os)[0] ?? null;
}

/**
 * Does the RECOMMENDED install path for this OS require Node.js first? (A tool can still have an npm
 * fallback that needs Node; we only force the Node prerequisite when the primary path does.)
 */
export function needsNode(tool: RuntimeToolSpec, os: RuntimeOs): boolean {
  return recommendedInstall(tool, os)?.needs === "node";
}
