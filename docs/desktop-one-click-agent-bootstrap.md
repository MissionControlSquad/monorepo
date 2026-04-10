# Desktop App: One-Click Agent Bootstrap

**Status:** Planned  
**Area:** `apps/desktop`, `apps/web/src/views/AgentSetupPage.tsx`

---

## Problem

Agent setup today is entirely manual. After creating an agent in the dashboard, the user must:

1. Manually create the workspace directory and copy 8 config files to `~/.openclaw/agents/<slug>/`
2. Run `openclaw agents add --id ... --workspace ...` in the terminal
3. Run `openclaw cron add --agent ... --cron ... --message ...` in the terminal
4. Wait for the first heartbeat to fire so `sync_identity` flips `setupStatus` from `pending_setup` → `active`

This is friction-heavy and error-prone. Users who install the desktop app should be able to go from agent creation to agent running with a single button click.

---

## Assumption

**Today:** only `openclaw` is required. The desktop app checks it is installed before proceeding and surfaces a clear error if not.

**Future:** when `claude`, `codex`, or other CLIs are added to agent setup, the desktop app requires **zero changes** — the server simply includes the new CLI name in `requiredClis` and the pre-flight check covers it automatically.

The desktop app does not install CLIs — it only verifies them.

---

## Goal

When a user installs the desktop app (DMG on Mac), the app can automate all setup steps because it has:

- Node.js `fs` access to write files anywhere on disk
- `child_process.spawn` to run any installed CLI (`openclaw`, `claude`, `codex`, etc.)
- The `window.electronAPI.isElectron` flag so the web UI can detect it's running inside the desktop app

> **macOS GUI PATH caveat:** When Electron launches as a `.app` bundle, macOS does NOT run any shell profile (`.zshrc`, `.bash_profile`). `process.env.PATH` is stripped to just `/usr/bin:/bin:/usr/sbin:/sbin`. Tools installed via Homebrew (`/opt/homebrew/bin`), nvm, or similar are invisible. The app must resolve the full login-shell PATH at startup before spawning any CLI (see Step 1 below).

**Target UX:** User creates an agent → sees a "Bootstrap with Desktop App" button → clicks it → app checks all required CLIs are present → runs setup steps → agent goes active.

---

## Architecture

### Data Flow

```
[AgentSetupPage — web UI running inside desktop]
        |
        | window.electronAPI.bootstrapAgent({ agentId, agentName,
        |   workspacePath, configFiles[], cronSchedule, cronMessage })
        v
[preload.ts]  →  ipcRenderer.invoke("bootstrap-agent", payload)
        |
        v
[main.ts: ipcMain.handle("bootstrap-agent")]
        |
        ├── fs.mkdir  ~/.openclaw/agents/<slug>/
        ├── fs.mkdir  ~/.openclaw/agents/<slug>/memory/
        ├── fs.writeFile × N  (IDENTITY.md, HEARTBEAT.md, PLAYBOOK.md, ...)
        ├── spawn  openclaw agents add --id <slug> --name <name> --workspace <path>
        ├── spawn  openclaw cron add --agent <slug> --cron "..." --message "..." --timeout-seconds 300
        └── spawn  openclaw cron run <cronId>   ←  triggers first heartbeat immediately
        |
        v
[Returns { steps: [{ name, status, output }] }]
        |
        v
[AgentSetupPage renders live step checklist]
        |
        v
[Agent sends agent.sync_identity  →  setupStatus: pending_setup → active]
        |
        v
[Dashboard: agent shown as ONLINE ✓]
```

---

## Implementation Plan

### Step 1 — Electron: shared helpers + `bootstrap-agent` IPC handler (`apps/desktop/main.ts`)

#### 1a. Resolve login-shell PATH at startup (macOS + Linux GUI PATH fix)

**Background — why this is needed on macOS and Linux but NOT Windows:**

| Platform | GUI launch behaviour | PATH state |
|----------|---------------------|-----------|
| macOS (DMG) | Launched by macOS LaunchServices, no shell involved | Stripped: `/usr/bin:/bin:/usr/sbin:/sbin` only |
| Linux (AppImage) | Launched by desktop environment (GNOME/KDE), no shell | Same — stripped |
| Windows (NSIS) | Launched via Windows shell which inherits full system env | Full PATH already available — no fix needed |
| Docker/headless | Shell is usually `/bin/bash` or `/bin/sh` | Depends on image; fallback handles it |

Initialise asynchronously inside `app.whenReady()` — **never use `execSync` in the Electron main process** as it blocks the entire UI thread (Electron performance docs).

```ts
import { exec } from "child_process"; // use async exec, NOT execSync
import os from "os";
import fs from "fs";

// Populated once inside app.whenReady() before any IPC handlers are called.
// Must be a let (not const) because it is assigned asynchronously.
let SHELL_PATH = process.env.PATH ?? ""; // safe default until resolved
let EXTRA_PATHS: string[] = [];          // cached at startup, not per-call

function resolveShellPathAsync(): Promise<string> {
  // Windows: GUI apps inherit full system PATH from the Windows shell — no fix needed.
  if (process.platform === "win32") return Promise.resolve(process.env.PATH ?? "");

  // macOS + Linux: GUI apps launch without a login shell so PATH is stripped.
  // Spawn the user's login shell to get the full PATH.
  // Using async exec() — never execSync() in the main process.
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/bash";
    // -l = login shell (sources .zshrc / .bash_profile / .profile)
    // -c = run command and exit
    exec(`${shell} -l -c 'echo $PATH'`, { timeout: 5000 }, (err, stdout) => {
      if (err) {
        // Shell launch failed (e.g. minimal Docker image) — keep current PATH
        resolve(process.env.PATH ?? "");
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function buildExtraPaths(): string[] {
  // Called once at startup. Result cached in EXTRA_PATHS and reused per-call
  // in buildSafeEnv() — avoids redundant NVM filesystem scans on every spawn.
  const home = os.homedir();
  const extras: string[] = [];

  if (process.platform !== "win32") {
    // ── Unix (macOS + Linux + Docker) ────────────────────────────────
    // Mirrors ShellService.buildEnv() in MissionControlSquad-macos-app.

    // NVM: add latest installed Node bin/ so npm global CLIs (like openclaw)
    // are found even when Node was installed via NVM, not a system package.
    const nvmDir = path.join(home, ".nvm", "versions", "node");
    try {
      const versions = fs.readdirSync(nvmDir)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) {
        const binPath = path.join(nvmDir, version, "bin");
        try { fs.readdirSync(binPath); extras.push(binPath); break; } catch { /* skip */ }
      }
    } catch { /* NVM not installed */ }

    extras.push(
      path.join(home, ".local", "bin"),
      path.join(home, ".cargo", "bin"),
      "/usr/local/bin",       // Homebrew Intel Mac + common Linux
      "/opt/homebrew/bin",    // Homebrew Apple Silicon
    );
  } else {
    // ── Windows ───────────────────────────────────────────────────────
    // npm global CLIs land in %APPDATA%\npm — add it explicitly.
    const appData = process.env.APPDATA;
    if (appData) extras.push(path.join(appData, "npm"));
  }

  return extras;
}
```

**Wire up in `app.whenReady()`** (already exists in main.ts):

```ts
app.whenReady().then(async () => {
  // Resolve full shell PATH and cache extra paths BEFORE registering IPC handlers.
  SHELL_PATH = await resolveShellPathAsync();
  EXTRA_PATHS = buildExtraPaths();

  setupIPC();       // register all ipcMain handlers
  createMainWindow(...);
  // ... rest of startup
});
```

Update `buildSafeEnv()` to use the cached values — **two-layer PATH, zero filesystem I/O per call**:

```ts
function buildSafeEnv(): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) safe[key] = process.env[key];
  }
  // Prepend cached extra paths, then fall back to full login-shell PATH.
  // path.delimiter is ":" on macOS/Linux and ";" on Windows.
  safe["PATH"] = [...EXTRA_PATHS, SHELL_PATH].filter(Boolean).join(path.delimiter);
  return safe;
}
```

#### 1b. Extract `spawnAsync` helper

The existing `execute-openclaw` handler inlines this logic. Extract it so `bootstrap-agent` can reuse it.

**Windows `.cmd` problem:** npm global CLIs install as `openclaw.cmd` on Windows. `spawn("openclaw", ...)` with `shell: false` won't find `.cmd` files. The naive fix (`shell: true`) is worse — Node.js v23.11+ deprecated passing args array alongside `shell: true` because spaces in args are NOT automatically quoted, causing word-splitting (`cronMessage = "Read HEARTBEAT.md..."` breaks into separate tokens).

**Correct fix:** On Windows, use `where.exe` to resolve the full `.cmd` path first, then spawn with `shell: false`. Args are then passed as a proper array with no quoting issues.

```ts
const SPAWN_MAX_BYTES = 32 * 1024;

// On Windows: resolve the full path to a CLI binary (e.g. "openclaw" → "C:\...\openclaw.cmd").
// This lets us use shell: false which keeps args as a proper array (no word-splitting on spaces).
// Returns the original cmd string unchanged on non-Windows or if where.exe fails.
function resolveWindowsCmd(cmd: string): Promise<string> {
  if (process.platform !== "win32") return Promise.resolve(cmd);
  return new Promise((resolve) => {
    exec(`where.exe "${cmd}"`, { timeout: 3000 }, (err, stdout) => {
      if (err) { resolve(cmd); return; }
      const lines = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // Prefer .cmd over .exe — npm global installs are .cmd
      resolve(lines.find(l => l.toLowerCase().endsWith(".cmd")) ?? lines[0] ?? cmd);
    });
  });
}

async function spawnAsync(
  cmd: string,
  args: string[],
  timeoutMs = 30_000
): Promise<{ stdout: string; stderr: string; code: number }> {
  // Resolve .cmd path on Windows so shell: false works correctly.
  // shell: false is required on all platforms — avoids deprecated shell: true + args array
  // pattern and prevents spaces in args (e.g. cronMessage) from causing word-splitting.
  const resolvedCmd = await resolveWindowsCmd(cmd);

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCmd, args, {
      timeout: timeoutMs,
      env: buildSafeEnv(),
      shell: false,   // always false — args passed as array, no shell injection
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout?.on("data", (data: Buffer) => {
      stdoutBytes += data.length;
      if (stdoutBytes <= SPAWN_MAX_BYTES) stdout += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderrBytes += data.length;
      if (stderrBytes <= SPAWN_MAX_BYTES) stderr += data.toString();
    });
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`"${cmd}" not found. Is it installed and on your PATH?`));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}
```

> The existing `execute-openclaw` handler should be refactored to call `spawnAsync` instead of duplicating the inline spawn logic.

#### 1c. Payload and return types

```ts
interface BootstrapAgentPayload {
  agentId: string;           // slug, e.g. "aria-frontend"
  agentName: string;
  // workspacePath may start with "~" (server generates it this way).
  // Must be expanded before any fs or spawn call — see handler below.
  workspacePath: string;
  configFiles: Array<{
    filename: string;        // bare filename only, e.g. "IDENTITY.md" — no path separators
    content: string;
  }>;
  // CLIs this bootstrap requires. Checked before any file is written.
  // The server decides what is needed — the desktop app just verifies.
  // e.g. ["openclaw", "claude", "codex"]
  requiredClis: string[];
  cronSchedule: string;      // e.g. "2,17,32,47 * * * *"
  cronMessage: string;
  triggerImmediately?: boolean;
}

interface BootstrapResult {
  success: boolean;
  steps: Array<{
    name: string;
    status: "success" | "failed" | "skipped";
    output?: string;
    error?: string;
  }>;
}
```

#### 1d. Handler logic

```ts
// Guard against concurrent calls (e.g. user double-clicks the button)
let bootstrapInProgress = false;

ipcMain.handle("bootstrap-agent", async (_event, payload: BootstrapAgentPayload): Promise<BootstrapResult> => {
  if (bootstrapInProgress) {
    throw new Error("A bootstrap is already in progress.");
  }
  bootstrapInProgress = true;

  const steps: BootstrapResult["steps"] = [];

  try {
    // ── Validation (returns { success: false } on error, never throws) ──
    // ipcMain.handle: if the handler throws, only the error.message is
    // serialised to the renderer (stack and custom fields are lost).
    // All error paths must return a BootstrapResult, not throw.

    // 1. Expand "~" — Node.js fs does NOT expand tilde.
    //    os.homedir() is cross-platform: /Users/x  /home/x  C:\Users\x  /root
    const resolvedWorkspace = payload.workspacePath.startsWith("~")
      ? path.join(os.homedir(), payload.workspacePath.slice(1))
      : payload.workspacePath;

    // 2. Enforce path is inside ~/.openclaw/agents/ (prevent path traversal).
    //    path.resolve() normalises separators cross-platform (\ on Windows).
    //    path.sep ensures the prefix check uses the correct separator per OS.
    const allowedRoot = path.join(os.homedir(), ".openclaw", "agents");
    const normalized = path.resolve(resolvedWorkspace);
    if (!normalized.startsWith(allowedRoot + path.sep) && normalized !== allowedRoot) {
      return { success: false, steps: [{ name: "Validation", status: "failed", error: `workspacePath must be inside ${allowedRoot}` }] };
    }

    // 3. Each filename must be a bare name — no path separators or traversal
    for (const file of payload.configFiles) {
      if (path.basename(file.filename) !== file.filename || file.filename.includes("..")) {
        return { success: false, steps: [{ name: "Validation", status: "failed", error: `Invalid filename: "${file.filename}"` }] };
      }
    }

    // ── Step 1: Verify all required CLIs are installed ────────────────
    // Done FIRST — before touching the filesystem — so we fail fast with a
    // clean error and leave no partial workspace on disk.
    //
    // Probe: `<cli> --version` (exit code 0 = installed).
    // Confirmed pattern: sibling macOS app uses `openclaw --version`
    // (AppState.swift:checkOpenClaw) for the same check.
    // Catches both ENOENT (not found) and non-zero exit (broken install).
    const missingClis: string[] = [];
    for (const cli of payload.requiredClis) {
      try {
        const result = await spawnAsync(cli, ["--version"], 10_000);
        if (result.code !== 0) missingClis.push(cli);
      } catch {
        missingClis.push(cli);
      }
    }
    if (missingClis.length > 0) {
      steps.push({
        name: "Verify required CLIs",
        status: "failed",
        error: `Missing: ${missingClis.join(", ")}. Ensure these are installed and on your PATH.`,
      });
      return { success: false, steps };
    }
    steps.push({ name: `Verify required CLIs (${payload.requiredClis.join(", ")})`, status: "success" });

    // ── Step 2: Create workspace directories ─────────────────────────
    // recursive: true creates all intermediate dirs in one call (no separate
    // mkdir for the parent needed).
    await fs.promises.mkdir(path.join(normalized, "memory"), { recursive: true });
    steps.push({ name: "Create workspace directories", status: "success" });

    // ── Step 3: Write config files ────────────────────────────────────
    for (const file of payload.configFiles) {
      await fs.promises.writeFile(path.join(normalized, file.filename), file.content, "utf-8");
    }
    steps.push({ name: `Write ${payload.configFiles.length} config files`, status: "success" });

    // ── Step 4: Register agent ─────────────────────────────────────────
    const addResult = await spawnAsync("openclaw", [
      "agents", "add",
      "--id", payload.agentId,
      "--name", payload.agentName,
      "--workspace", normalized,
    ], 30_000);

    // Exit code 0 = registered. Some openclaw versions may return non-zero
    // if agent already exists — treat that as a warning, not a hard failure,
    // so re-running bootstrap is safe (idempotent).
    const addOk = addResult.code === 0;
    steps.push({
      name: "Register agent (openclaw agents add)",
      status: addOk ? "success" : "skipped",
      output: addResult.stdout,
      error: addOk ? undefined : `exit ${addResult.code} — agent may already be registered: ${addResult.stderr}`,
    });
    // Only hard-fail if stderr suggests a real error (not "already exists")
    if (!addOk && !addResult.stderr.toLowerCase().includes("already")) {
      return { success: false, steps };
    }

    // ── Step 5: Schedule heartbeat cron ───────────────────────────────
    const cronResult = await spawnAsync("openclaw", [
      "cron", "add",
      "--agent", payload.agentId,
      "--name", `${payload.agentId}-heartbeat`,
      "--cron", payload.cronSchedule,
      "--message", payload.cronMessage,
      "--timeout-seconds", "300",
    ], 30_000);
    steps.push({
      name: "Schedule heartbeat cron",
      status: cronResult.code === 0 ? "success" : "failed",
      output: cronResult.stdout,
      error: cronResult.code !== 0 ? cronResult.stderr : undefined,
    });
    if (cronResult.code !== 0) return { success: false, steps };

    // ── Step 6: Trigger first heartbeat immediately (optional) ────────
    // NOTE: This step requires knowing the cronId returned by "cron add".
    // The exact output format of `openclaw cron add` must be confirmed before
    // implementing parseCronId(). Until confirmed, skip this step and let the
    // cron fire on its natural schedule. Remove this note once openclaw output
    // format is known and tested.
    if (payload.triggerImmediately) {
      steps.push({
        name: "Trigger first heartbeat",
        status: "skipped",
        output: "Skipped — cronId parsing from 'openclaw cron add' output not yet confirmed. Agent will fire on its scheduled cron.",
      });
    }

    return { success: true, steps };
  } finally {
    bootstrapInProgress = false;
  }
});
```

---

### Step 2 — Electron: expose in `preload.ts`

```ts
// Add to contextBridge.exposeInMainWorld("electronAPI", { ... })
bootstrapAgent: (payload: BootstrapAgentPayload): Promise<BootstrapResult> =>
  ipcRenderer.invoke("bootstrap-agent", payload),
```

---

### Step 3 — Type definitions (`electron-env.d.ts`)

```ts
interface BootstrapAgentPayload {
  agentId: string;
  agentName: string;
  workspacePath: string;
  configFiles: Array<{ filename: string; content: string }>;
  requiredClis: string[];   // e.g. ["openclaw", "claude", "codex"] — verified before setup starts
  cronSchedule: string;
  cronMessage: string;
  triggerImmediately?: boolean;
}

interface BootstrapStep {
  name: string;
  status: "success" | "failed" | "skipped";
  output?: string;
  error?: string;
}

interface BootstrapResult {
  success: boolean;
  steps: BootstrapStep[];
}

interface ElectronAPI {
  isElectron: true;
  platform: string;
  execute: (args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
  setServerUrl: (url: string) => void;
  bootstrapAgent: (payload: BootstrapAgentPayload) => Promise<BootstrapResult>;  // NEW
}
```

---

### Step 4 — Web UI: desktop-aware setup button (`AgentSetupPage.tsx`)

**Detection:**

```ts
const isDesktopApp = typeof window !== "undefined" && window.electronAPI?.isElectron === true;
```

**Rendering — desktop app adds a new option, manual flow always stays visible:**

```tsx
{/* Desktop-only: one-click bootstrap — shown as an additional option above manual steps */}
{isDesktopApp && (
  <DesktopBootstrapButton
    agentId={agent.id}
    agentName={agent.name}
    setupData={setupData}
    onComplete={() => refetch()}
  />
)}

{/* Manual setup instructions — always shown on all platforms, never hidden */}
<ManualSetupInstructions setupData={setupData} />
```

> **Rule:** the desktop bootstrap is an *additive* option. The manual instructions remain fully visible on every platform so users can always fall back to doing it themselves. Do not conditionally hide or replace any existing UI blocks.

**`DesktopBootstrapButton` component behaviour:**

- Idle state: "Bootstrap with Desktop App" button
- In-progress state: live checklist of steps with spinners/checkmarks
- Success state: "Agent is setting up — first heartbeat triggered" + link to agent page
- Error state: show which step failed + raw output for debugging

**Payload construction (from existing setup API response):**

```ts
// GET /api/agents/{id}/setup already returns:
// { configFiles: [{filename, content}], cronSchedule, cronMessage, workspacePath }
// Pass this directly to bootstrapAgent()

await window.electronAPI.bootstrapAgent({
  agentId: agent.id,
  agentName: agent.name,
  workspacePath: setupData.workspacePath,
  configFiles: setupData.configFiles,
  cronSchedule: setupData.cronSchedule,
  cronMessage: setupData.cronMessage,
  triggerImmediately: true,
});
```

---

### Step 5 — Backend: verify setup API returns structured data

Check `GET /api/agents/{id}/setup` (`apps/web/app/api/agents/[id]/setup/route.ts`) returns `configFiles` as a machine-readable array, not just display strings. If it only returns HTML/markdown display output today, add a structured field alongside it.

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| `execSync` blocking Electron UI | Replaced with async `exec()` wrapped in a Promise. Resolved inside `app.whenReady()` before IPC handlers are registered — never at module level. |
| macOS + Linux GUI PATH stripping | Two-layer strategy: Layer 1 = login-shell PATH via async `exec($SHELL -l -c 'echo $PATH')`; Layer 2 = cached Unix extra paths (`/opt/homebrew/bin`, NVM bin, etc.) prepended. Both cached at startup — zero I/O per `spawn` call. |
| Windows `.cmd` CLI resolution | `shell: true` + args array is deprecated in Node v23.11+ and does not quote args with spaces. Fixed: `resolveWindowsCmd()` uses `where.exe` to find the full `.cmd` path; all platforms then use `shell: false` with args as a proper array. |
| Windows PATH for npm globals | `%APPDATA%\npm` added to `EXTRA_PATHS` on Windows only (where npm global CLIs land). |
| Spaces in args (`cronMessage`) | `shell: false` on all platforms + args passed as array — spaces in `cronMessage` ("Read HEARTBEAT.md...") are preserved correctly, never word-split. |
| `ipcMain.handle` errors | Validation never `throw`s — always returns `{ success: false, steps }`. Electron only serialises `error.message` on thrown exceptions (stack is lost). |
| CLI check ordering | Pre-flight runs as Step 1, before any filesystem writes — no partial workspace left on disk if a CLI is missing. |
| `buildSafeEnv()` NVM scan | NVM scan moved to `buildExtraPaths()` called once in `app.whenReady()`; result cached in `EXTRA_PATHS`. `buildSafeEnv()` does zero I/O. |
| `~` not expanded by Node.js `fs` | Expanded via `path.join(os.homedir(), workspacePath.slice(1))` — `os.homedir()` is cross-platform |
| Path traversal in `workspacePath` | `path.resolve()` normalises separators; prefix check uses `path.sep` — correct on all platforms |
| Path traversal in filenames | `path.basename(f) === f` and no `..` — validated before any write |
| Arbitrary command execution | `shell: false` always; CLI names from `payload.requiredClis` (server-declared); args are array elements never interpolated into a shell string |
| Concurrent bootstrap calls | Module-level `bootstrapInProgress` flag — second call returns immediately |
| Already-registered agent | `openclaw agents add` non-zero exit treated as soft warning if stderr contains "already" — idempotent re-runs |
| Missing CLI pre-flight | Checks both exception (ENOENT) AND exit code — correctly catches broken installs that exist but don't work |
| IPC spoofing | Handler runs in main process; renderer has no Node access (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`) |

---

## Files to Change

| File | Change |
|------|--------|
| `apps/desktop/main.ts` | Add imports: `exec` (async, from child_process), `os`, `fs`; add `resolveShellPathAsync()` + `buildExtraPaths()` called inside `app.whenReady()` before `setupIPC()`; cache as `SHELL_PATH` + `EXTRA_PATHS`; update `buildSafeEnv()` to use cached values (zero I/O per call); add `resolveWindowsCmd()` using `where.exe`; extract `spawnAsync` with `shell: false` always; add `ipcMain.handle("bootstrap-agent", ...)` with CLI check first, validation returns not throws, cross-platform `~` expansion, path + filename validation, idempotent agent-add, concurrent-call guard |
| `apps/desktop/preload.ts` | Expose `bootstrapAgent()` via contextBridge |
| `apps/desktop/electron-env.d.ts` | Add `BootstrapAgentPayload`, `BootstrapResult`, `BootstrapStep` types + update `ElectronAPI` interface |
| `apps/web/src/views/AgentSetupPage.tsx` | Add `isDesktopApp` detection + `DesktopBootstrapButton` component |
| `apps/web/app/api/agents/[id]/setup/route.ts` | Verify (or add) structured `configFiles` array in response |

---

## Known Unknowns (must confirm before implementing)

- **`openclaw cron add` output format** — The "trigger immediately" step requires parsing the `cronId` from stdout. The exact output format is not documented in this repo. Confirm by running `openclaw cron add` manually and checking what it prints. Until confirmed, Step 6 is skipped and the agent fires on its natural cron schedule.

---

## Out of Scope

- **Installing CLIs** — all environments are expected to have `openclaw`, `claude`, `codex`, and any other required tools pre-installed. The app verifies, not installs.
- Cloud VM provisioning — separate flow, handled server-side.
- Windows CLI binaries — `spawn("openclaw", ...)` on Windows correctly resolves `.exe` via `CreateProcess`; no change needed.
- Docker headless mode — `resolveShellPath()` falls back to `process.env.PATH`; as long as required CLIs are on PATH in the container, bootstrap works.
- Linux `$SHELL` pointing to `/bin/sh` — PATH resolution via `-l` may be minimal; encourage `bash` or `zsh` as the default shell.
