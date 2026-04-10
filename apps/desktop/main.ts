import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  session,
  Tray,
  ipcMain,
  screen,
  shell,
  nativeImage,
} from "electron";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import log from "electron-log/main";
import path from "path";
import { spawn, exec } from "child_process";
import https from "https";
import os from "os";
import fs from "fs";

// Initialise electron-log: writes to ~/Library/Logs/AgentCenter/ (macOS),
// %APPDATA%\AgentCenter\logs\ (Windows), ~/.config/AgentCenter/logs/ (Linux).
log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB per log file
// Also forward to the renderer console in dev
log.transports.console.level = app.isPackaged ? "warn" : "debug";

// ── App identity (must be set before app is ready) ───────────────────
app.setName("AgentCenter");

// Only http/https/mailto are safe to hand off to the OS
const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// ── Global error handlers ─────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  // Log full details internally; show only a generic message to the user
  // to avoid leaking file paths or internal state.
  log.error("[uncaughtException]", err);
  dialog.showErrorBox(
    "Unexpected Error",
    "AgentCenter encountered an unexpected error and needs to restart.\n\nIf this keeps happening, please check the application logs."
  );
  app.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.error("[unhandledRejection]", reason);
});

// ── Persistent config store ───────────────────────────────────────────
const store = new Store<{ serverUrl: string; windowBounds: Electron.Rectangle }>(
  { name: "agentcenter-config" }
);

let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Crash-loop protection: stop auto-reloading after MAX_AUTO_RELOADS consecutive
// crashes within CRASH_WINDOW_MS. Counter resets after a clean CRASH_WINDOW_MS period.
const MAX_AUTO_RELOADS = 3;
const CRASH_WINDOW_MS = 30_000;
let rendererCrashCount = 0;
let crashWindowTimer: ReturnType<typeof setTimeout> | null = null;

// ── Shell PATH resolution (macOS + Linux GUI fix) ─────────────────────
// Populated once inside app.whenReady() before any IPC handlers are called.
// Safe defaults until resolved — never undefined.
let SHELL_PATH = process.env.PATH ?? "";
let EXTRA_PATHS: string[] = [];

/**
 * Resolves the full login-shell PATH asynchronously.
 *
 * macOS and Linux GUI apps launch without a login shell, so process.env.PATH
 * is stripped to /usr/bin:/bin:/usr/sbin:/sbin. Tools installed via Homebrew,
 * nvm, or similar are invisible. Spawning a login shell fixes this.
 * Windows GUI apps inherit the full system PATH — no fix needed.
 */
function resolveShellPathAsync(): Promise<string> {
  if (process.platform === "win32") return Promise.resolve(process.env.PATH ?? "");
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/bash";
    exec(`${shell} -l -c 'echo $PATH'`, { timeout: 5000 }, (err, stdout) => {
      if (err) {
        log.warn("[PATH] login-shell exec failed, keeping current PATH:", err.message);
        resolve(process.env.PATH ?? "");
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Builds a list of extra PATH entries to prepend.
 * Called once at startup; result is cached in EXTRA_PATHS.
 * Mirrors ShellService.buildEnv() in the native macOS companion app.
 */
function buildExtraPaths(): string[] {
  const home = os.homedir();
  const extras: string[] = [];

  if (process.platform !== "win32") {
    // NVM: add latest installed Node bin/ so npm global CLIs (openclaw etc.)
    // are found even when Node was installed via nvm, not a system package.
    const nvmDir = path.join(home, ".nvm", "versions", "node");
    try {
      const versions = fs
        .readdirSync(nvmDir)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) {
        const binPath = path.join(nvmDir, version, "bin");
        try {
          fs.readdirSync(binPath);
          extras.push(binPath);
          break;
        } catch { /* skip broken version */ }
      }
    } catch { /* nvm not installed */ }

    extras.push(
      path.join(home, ".local", "bin"),
      path.join(home, ".cargo", "bin"),
      "/usr/local/bin",     // Homebrew Intel Mac + common Linux
      "/opt/homebrew/bin",  // Homebrew Apple Silicon
    );
  } else {
    // Windows: npm global CLIs land in %APPDATA%\npm
    const appData = process.env.APPDATA;
    if (appData) extras.push(path.join(appData, "npm"));
  }

  return extras;
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Resolves the path to a bundled icon file.
 * In a packaged app, icons are copied to process.resourcesPath via extraResources.
 * In development they live in apps/desktop/build/.
 */
function getIconPath(format: "png" | "icns" = "png"): string {
  const filename = format === "icns" ? "icon.icns" : "icon.png";
  return app.isPackaged
    ? path.join(process.resourcesPath, filename)
    : path.join(app.getAppPath(), "build", filename);
}

function getServerUrl(): string | undefined {
  return store.get("serverUrl") as string | undefined;
}

function saveWindowBounds() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    store.set("windowBounds", mainWindow.getBounds());
  }
}

/**
 * Returns the saved bounds only if they intersect a connected display.
 * Prevents the window from opening off-screen after a monitor is disconnected.
 */
function getValidatedBounds(
  saved: Electron.Rectangle | undefined
): Partial<Electron.Rectangle> {
  if (!saved) return {};
  const displays = screen.getAllDisplays();
  const isVisible = displays.some((d) => {
    const b = d.bounds;
    return (
      saved.x < b.x + b.width &&
      saved.x + saved.width > b.x &&
      saved.y < b.y + b.height &&
      saved.y + saved.height > b.y
    );
  });
  return isVisible ? saved : {};
}

// ── Config (first-launch) window ──────────────────────────────────────
function createConfigWindow() {
  configWindow = new BrowserWindow({
    width: 480,
    height: 300,
    resizable: false,
    title: "AgentCenter — Server Configuration",
    icon: getIconPath("png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Escape for safe embedding inside an HTML attribute value
  const currentUrl = (getServerUrl() || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  configWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1a1a2e; color: #e0e0e0;
      display: flex; align-items: center; justify-content: center;
      height: 100vh; padding: 32px;
      -webkit-app-region: drag;
    }
    .card {
      width: 100%; max-width: 400px;
      -webkit-app-region: no-drag;
    }
    h1 { font-size: 20px; margin-bottom: 8px; color: #fff; }
    p { font-size: 13px; color: #999; margin-bottom: 20px; }
    input {
      width: 100%; padding: 10px 12px; border-radius: 8px;
      border: 1px solid #333; background: #0f0f23; color: #fff;
      font-size: 14px; outline: none; margin-bottom: 16px;
    }
    input:focus { border-color: #6366f1; }
    button {
      width: 100%; padding: 10px; border: none; border-radius: 8px;
      background: #6366f1; color: #fff; font-size: 14px;
      cursor: pointer; font-weight: 600;
    }
    button:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>AgentCenter</h1>
    <p>Enter your AgentCenter server URL to get started.</p>
    <input id="url" type="url" placeholder="https://app.agentcenter.cloud" value="${currentUrl}" autofocus />
    <button onclick="connect()">Connect</button>
  </div>
  <script>
    function connect() {
      const url = document.getElementById('url').value.trim().replace(/\\/+$/, '');
      if (!url) return;
      try { new URL(url); } catch { alert('Please enter a valid URL.'); return; }
      window.electronAPI.setServerUrl(url);
    }
    document.getElementById('url').addEventListener('keydown', e => {
      if (e.key === 'Enter') connect();
    });
  </script>
</body>
</html>
`)}`
  );

  configWindow.on("closed", () => {
    configWindow = null;
  });
}

// ── Main window ───────────────────────────────────────────────────────
function createMainWindow(serverUrl: string) {
  const savedBounds = store.get("windowBounds") as Electron.Rectangle | undefined;
  const bounds = getValidatedBounds(savedBounds);

  mainWindow = new BrowserWindow({
    width: bounds.width ?? 1280,
    height: bounds.height ?? 800,
    x: bounds.x,
    y: bounds.y,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    title: "AgentCenter",
    icon: getIconPath("png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      partition: "persist:agentcenter",
    },
  });

  mainWindow.loadURL(serverUrl);

  // ── macOS traffic-light clearance ────────────────────────────────────
  // With titleBarStyle: "hiddenInset" the web content fills the full window
  // height from y=0, putting it directly under the traffic-light buttons.
  // After every navigation we:
  //   1. Set --electron-titlebar-height on :root so the web app can use it.
  //   2. Inject a thin transparent drag region so the inset area still moves
  //      the window even when the web app has content there.
  if (process.platform === "darwin") {
    const TITLEBAR_HEIGHT = 38; // px — covers traffic lights + comfortable margin

    const injectTitlebarShim = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;

      mainWindow.webContents
        .insertCSS(
          `:root { --electron-titlebar-height: ${TITLEBAR_HEIGHT}px; }`
        )
        .catch(() => {});

      // A fixed, transparent, pointer-events-none drag strip at the top.
      // z-index is intentionally enormous so it sits above web content but
      // pointer-events:none means it never steals clicks.
      mainWindow.webContents
        .executeJavaScript(
          `(function(){
            var ID='__electron_drag_strip__';
            if(document.getElementById(ID))return;
            var el=document.createElement('div');
            el.id=ID;
            el.style.cssText=[
              'position:fixed','top:0','left:0','right:0',
              'height:${TITLEBAR_HEIGHT}px',
              'z-index:2147483647',
              '-webkit-app-region:drag',
              'pointer-events:none'
            ].join(';');
            document.documentElement.appendChild(el);
          })()`
        )
        .catch(() => {});
    };

    mainWindow.webContents.on("did-finish-load", injectTitlebarShim);
  }

  // Crash / GPU process gone — with loop protection
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("[render-process-gone]", details);
    if (details.reason === "clean-exit") return;

    rendererCrashCount++;

    // Reset the counter after a stable CRASH_WINDOW_MS with no crashes
    if (crashWindowTimer) clearTimeout(crashWindowTimer);
    crashWindowTimer = setTimeout(() => {
      rendererCrashCount = 0;
      crashWindowTimer = null;
    }, CRASH_WINDOW_MS);

    if (rendererCrashCount <= MAX_AUTO_RELOADS) {
      dialog.showErrorBox(
        "Renderer Crashed",
        `The AgentCenter window crashed (${details.reason}). Reloading…`
      );
      mainWindow?.reload();
    } else {
      dialog.showErrorBox(
        "Renderer Crashed",
        "AgentCenter has crashed multiple times in a short period.\n\nPlease restart the application manually."
      );
    }
  });

  mainWindow.webContents.on("unresponsive", () => {
    log.warn("[webContents] window became unresponsive");
    dialog
      .showMessageBox({
        type: "warning",
        title: "AgentCenter is not responding",
        message: "The window is not responding. Would you like to reload it?",
        buttons: ["Reload", "Wait"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) mainWindow?.reload();
      });
  });

  // Open external links in the default browser.
  // Only allow http/https/mailto — block file://, smb://, ms-settings://, etc.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const serverOrigin = new URL(serverUrl).origin;
    if (!url.startsWith(serverOrigin)) {
      try {
        const { protocol } = new URL(url);
        if (SAFE_EXTERNAL_PROTOCOLS.has(protocol)) {
          shell.openExternal(url);
        }
      } catch {
        // ignore unparseable URLs
      }
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Prevent the main window from navigating away from the server origin.
  // Reads from store on every call so it stays correct after a server URL change.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentServerUrl = getServerUrl();
    if (!currentServerUrl) return;
    try {
      const serverOrigin = new URL(currentServerUrl).origin;
      const navOrigin = new URL(url).origin;
      if (navOrigin !== serverOrigin) {
        event.preventDefault();
        const { protocol } = new URL(url);
        if (SAFE_EXTERNAL_PROTOCOLS.has(protocol)) {
          shell.openExternal(url);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on("resize", saveWindowBounds);
  mainWindow.on("move", saveWindowBounds);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── System tray ───────────────────────────────────────────────────────
function createTray() {
  // Resize to 16x16 for macOS menu bar; other platforms use the icon as-is
  let trayIcon = nativeImage.createFromPath(getIconPath("png"));
  if (process.platform === "darwin") {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }
  tray = new Tray(trayIcon);
  tray.setToolTip("AgentCenter");

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show AgentCenter",
      click: () => mainWindow?.focus(),
    },
    { type: "separator" },
    {
      label: "Change Server URL...",
      click: () => showChangeServerUrl(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(contextMenu);
}

// ── macOS native menu ─────────────────────────────────────────────────
function buildAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "AgentCenter",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Change Server URL...",
          accelerator: "CmdOrCtrl+,",
          click: () => showChangeServerUrl(),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        // DevTools only available in development
        ...(!app.isPackaged
          ? ([{ role: "toggleDevTools" }] as Electron.MenuItemConstructorOptions[])
          : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showChangeServerUrl() {
  if (configWindow) {
    configWindow.focus();
    return;
  }
  createConfigWindow();
}

// ── IPC handlers ──────────────────────────────────────────────────────
const ALLOWED_OPENCLAW_COMMANDS = [
  "status",
  "list",
  "run",
  "stop",
  "logs",
  "config",
  "version",
  "help",
];

// Only pass through safe, non-sensitive environment variables to the subprocess
const SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TMP",
  "TEMP",
];

function buildSafeEnv(): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      safe[key] = process.env[key];
    }
  }
  // Two-layer PATH: cached extra paths (nvm, homebrew, etc.) prepended to the
  // full login-shell PATH resolved at startup. Zero filesystem I/O per call.
  safe["PATH"] = [...EXTRA_PATHS, SHELL_PATH].filter(Boolean).join(path.delimiter);
  return safe;
}

const SPAWN_MAX_BYTES = 32 * 1024; // 32 KB cap per stream

/**
 * On Windows, npm global CLIs install as `<name>.cmd`.
 * `spawn("openclaw", ...)` with `shell: false` won't find `.cmd` files.
 * Using `shell: true` + args array is deprecated in Node v23.11+ (word-splitting risk).
 * Correct fix: resolve the full .cmd path via where.exe, then spawn with shell: false.
 * Returns the original cmd unchanged on non-Windows or if where.exe fails.
 */
function resolveWindowsCmd(cmd: string): Promise<string> {
  if (process.platform !== "win32") return Promise.resolve(cmd);
  return new Promise((resolve) => {
    exec(`where.exe "${cmd}"`, { timeout: 3000 }, (err, stdout) => {
      if (err) { resolve(cmd); return; }
      const lines = stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // Prefer .cmd over .exe — npm global installs are .cmd
      resolve(lines.find((l) => l.toLowerCase().endsWith(".cmd")) ?? lines[0] ?? cmd);
    });
  });
}

/**
 * Spawns a CLI with a proper arg array (shell: false on all platforms).
 * Resolves the .cmd path on Windows first so shell: false works correctly.
 * Caps stdout/stderr at SPAWN_MAX_BYTES to prevent memory exhaustion.
 */
async function spawnAsync(
  cmd: string,
  args: string[],
  timeoutMs = 30_000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return spawnWithProgress(cmd, args, timeoutMs, null);
}

/**
 * Like spawnAsync but also calls onProgress with each stdout/stderr chunk
 * as it arrives, enabling live-streaming output to the renderer.
 * Pass null for onProgress to skip streaming (equivalent to spawnAsync).
 */
async function spawnWithProgress(
  cmd: string,
  args: string[],
  timeoutMs = 30_000,
  onProgress: ((chunk: string) => void) | null,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const resolvedCmd = await resolveWindowsCmd(cmd);

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCmd, args, {
      timeout: timeoutMs,
      env: buildSafeEnv(),
      shell: false, // always false — args as array, no shell injection, no word-splitting
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout?.on("data", (data: Buffer) => {
      stdoutBytes += data.length;
      if (stdoutBytes <= SPAWN_MAX_BYTES) {
        const chunk = data.toString();
        stdout += chunk;
        onProgress?.(chunk);
      }
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderrBytes += data.length;
      if (stderrBytes <= SPAWN_MAX_BYTES) {
        const chunk = data.toString();
        stderr += chunk;
        onProgress?.(chunk);
      }
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

/**
 * Downloads a file via HTTPS to a local destination, following up to 5 redirects.
 */
function downloadFile(url: string, dest: string, redirectsLeft = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) { reject(new Error("Too many redirects")); return; }
    const file = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        file.close();
        fs.unlink(dest, () => {});
        if (res.headers.location) {
          downloadFile(res.headers.location, dest, redirectsLeft - 1).then(resolve).catch(reject);
        } else {
          reject(new Error("Redirect without Location header"));
        }
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });
    req.on("error", (err) => { fs.unlink(dest, () => {}); reject(err); });
    file.on("error", (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

function setupIPC() {
  // Config window: set server URL
  ipcMain.on("set-server-url", (event, url: string) => {
    // Only accept this message from the config window to prevent spoofing
    if (!configWindow || event.sender !== configWindow.webContents) return;
    store.set("serverUrl", url);
    if (configWindow) {
      configWindow.close();
      configWindow = null;
    }
    if (mainWindow) {
      mainWindow.loadURL(url);
    } else {
      createMainWindow(url);
    }
  });

  // CLI execution with allowlisted subcommands
  ipcMain.handle(
    "execute-openclaw",
    async (_event, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> => {
      const subcommand = args[0];
      if (!subcommand || !ALLOWED_OPENCLAW_COMMANDS.includes(subcommand)) {
        throw new Error(
          `Command not allowed: "${subcommand}". Allowed: ${ALLOWED_OPENCLAW_COMMANDS.join(", ")}`
        );
      }
      return spawnAsync("openclaw", args, 30_000);
    }
  );

  // ── One-click agent bootstrap ────────────────────────────────────────
  // Types mirror electron-env.d.ts (BootstrapAgentPayload / BootstrapResult).
  // Handler always returns a BootstrapResult — never throws — because
  // ipcMain.handle only serialises error.message on thrown exceptions (stack lost).

  interface BootstrapAgentPayload {
    agentId: string;
    agentName: string;
    workspacePath: string;
    configFiles: Array<{ filename: string; content: string }>;
    requiredClis: string[];
    cronSchedule: string;
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

  // Guard against concurrent calls (e.g. user double-clicks the button)
  let bootstrapInProgress = false;

  ipcMain.handle(
    "bootstrap-agent",
    async (event, payload: BootstrapAgentPayload): Promise<BootstrapResult> => {
      const sendStatus = (message: string) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("bootstrap-status", message);
        }
      };

      if (bootstrapInProgress) {
        return {
          success: false,
          steps: [{ name: "Guard", status: "failed", error: "A bootstrap is already in progress." }],
        };
      }
      bootstrapInProgress = true;

      const steps: BootstrapResult["steps"] = [];

      try {
        // ── Validation ─────────────────────────────────────────────────
        // 1. Expand "~" — Node.js fs does NOT expand tilde.
        const resolvedWorkspace = payload.workspacePath.startsWith("~")
          ? path.join(os.homedir(), payload.workspacePath.slice(1))
          : payload.workspacePath;

        // 2. Prevent path traversal — workspace must be inside ~/.openclaw/agents/
        const allowedRoot = path.join(os.homedir(), ".openclaw", "agents");
        const normalized = path.resolve(resolvedWorkspace);
        if (!normalized.startsWith(allowedRoot + path.sep) && normalized !== allowedRoot) {
          return {
            success: false,
            steps: [{ name: "Validation", status: "failed", error: `workspacePath must be inside ${allowedRoot}` }],
          };
        }

        // 3. Filenames must be bare names — no path separators or traversal
        for (const file of payload.configFiles) {
          if (path.basename(file.filename) !== file.filename || file.filename.includes("..")) {
            return {
              success: false,
              steps: [{ name: "Validation", status: "failed", error: `Invalid filename: "${file.filename}"` }],
            };
          }
        }

        // ── Step 1: Verify all required CLIs are installed ──────────────
        // Run FIRST — fail fast before touching the filesystem so no partial
        // workspace is left on disk if a CLI is missing.
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
        steps.push({
          name: `Verify required CLIs (${payload.requiredClis.join(", ")})`,
          status: "success",
        });

        // ── Step 2: Ensure OpenClaw gateway is running ──────────────────
        // `openclaw gateway status` reads the service state without connecting —
        // safe to call even when pairing is required.
        const gatewayStatus = await spawnAsync("openclaw", ["gateway", "status"], 10_000);
        const statusOut = gatewayStatus.stdout + gatewayStatus.stderr;
        const gatewayRunning = statusOut.includes("running") && statusOut.includes("pid");
        const gatewayInstalled = !statusOut.includes("not installed");

        if (!gatewayInstalled) {
          // Service not installed — install it first, then start.
          log.info("[bootstrap] gateway service not installed, installing...");
          await spawnAsync("openclaw", ["gateway", "install"], 15_000);
        }

        // Ensure gateway.mode is set in openclaw.json before starting.
        // A fresh install (or wiped ~/.openclaw) creates a config without gateway.mode,
        // causing the gateway to start but reject ALL connections with error 1006.
        // Setting gateway.mode=local here fixes that without requiring an interactive setup.
        try {
          const ocConfigPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
          const raw = await fs.promises.readFile(ocConfigPath, "utf-8");
          const ocConfig = JSON.parse(raw);
          if (!ocConfig.gateway?.mode) {
            ocConfig.gateway = { ...(ocConfig.gateway ?? {}), mode: "local" };
            await fs.promises.writeFile(ocConfigPath, JSON.stringify(ocConfig, null, 2), "utf-8");
            log.info("[bootstrap] patched openclaw.json: set gateway.mode=local");
          }
        } catch (err) {
          log.warn("[bootstrap] could not patch openclaw.json:", err);
        }

        if (!gatewayRunning) {
          log.info("[bootstrap] gateway not running, starting service...");
          const startResult = await spawnAsync("openclaw", ["gateway", "start"], 15_000);
          const startOut = startResult.stdout + startResult.stderr;

          // Poll up to 10 s for gateway to become ready.
          let ready = false;
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const poll = await spawnAsync("openclaw", ["gateway", "status"], 5_000);
            if ((poll.stdout + poll.stderr).includes("running")) { ready = true; break; }
          }

          steps.push({
            name: "Start OpenClaw gateway",
            status: ready ? "success" : "failed",
            output: startOut || undefined,
            error: ready ? undefined : "Gateway did not start within 10 s. Run: openclaw gateway start",
          });
          if (!ready) return { success: false, steps };
        } else {
          steps.push({ name: "OpenClaw gateway is running", status: "success" });
        }

        // Check if gateway requires device pairing before proceeding.
        // `openclaw gateway health` actually connects — if pairing is required
        // it exits non-zero with "pairing required" in stderr.
        const healthResult = await spawnAsync("openclaw", ["gateway", "health"], 10_000);
        const healthOut = healthResult.stdout + healthResult.stderr;
        if (healthOut.includes("pairing required") || healthOut.includes("GatewayClientRequestError")) {
          steps.push({
            name: "OpenClaw gateway pairing",
            status: "failed",
            error:
              "The OpenClaw gateway requires device pairing.\n\n" +
              "Fix:\n" +
              "  1. Run: openclaw devices list\n" +
              "  2. Find your pending request ID\n" +
              "  3. Run: openclaw devices approve <requestId>\n\n" +
              "Then retry — workspace files are already written.",
          });
          return { success: false, steps };
        }
        steps.push({ name: "OpenClaw gateway pairing", status: "success" });

        // ── Step 3: Create workspace directories ────────────────────────
        // recursive: true creates all intermediate dirs in one call.
        await fs.promises.mkdir(path.join(normalized, "memory"), { recursive: true });
        steps.push({ name: "Create workspace directories", status: "success" });

        // ── Step 4: Write config files ──────────────────────────────────
        for (const file of payload.configFiles) {
          await fs.promises.writeFile(
            path.join(normalized, file.filename),
            file.content,
            "utf-8",
          );
        }
        steps.push({ name: `Write ${payload.configFiles.length} config files`, status: "success" });

        // ── Step 5: Register agent ──────────────────────────────────────
        // Correct syntax: openclaw agents add <name> --workspace <dir> --non-interactive
        // There is no --id or --name flag; name is a positional argument.
        const addResult = await spawnAsync(
          "openclaw",
          ["agents", "add", payload.agentName, "--workspace", normalized, "--non-interactive"],
          30_000,
        );

        // Treat "already exists" as a soft warning so re-running bootstrap is safe (idempotent).
        // openclaw prints "already exists" to stdout (not stderr), so check both.
        const addOk = addResult.code === 0;
        const addOut = (addResult.stdout + addResult.stderr).toLowerCase();
        const alreadyExists = !addOk && addOut.includes("already");
        steps.push({
          name: "Register agent (openclaw agents add)",
          status: addOk ? "success" : alreadyExists ? "skipped" : "failed",
          output: addResult.stdout || undefined,
          error: addOk || alreadyExists ? undefined : `exit ${addResult.code}: ${addResult.stderr}`,
        });
        if (!addOk && !alreadyExists) return { success: false, steps };

        // ── Between Step 5 and 6: wait for gateway to reload ──────────
        // `openclaw agents add` restarts the gateway via LaunchAgent to reload
        // the new agent config. The process comes back quickly but can get
        // stuck accepting connections (1006). If health keeps failing after
        // 5 s we force a full restart to clear the stuck state.
        {
          log.info("[bootstrap] agents add done, waiting for gateway to be healthy...");
          sendStatus("Waiting for gateway to reload…");

          const isGatewayHealthy = async (): Promise<boolean> => {
            const poll = await spawnAsync("openclaw", ["gateway", "health"], 8_000);
            const out = (poll.stdout + poll.stderr).trim();
            log.info(`[bootstrap] gateway health: code=${poll.code} out="${out.slice(0, 160)}"`);
            return poll.code === 0 && !out.includes("pairing required") && !out.includes("gateway closed");
          };

          // Phase 1: poll health for 5 s — fast path if gateway reloads cleanly
          let gatewayReady = false;
          for (let i = 0; i < 5; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            sendStatus(`Waiting for gateway… (${i + 1}/5)`);
            if (await isGatewayHealthy()) { gatewayReady = true; break; }
          }

          // Phase 2: gateway stuck — patch config + force a full restart
          if (!gatewayReady) {
            log.info("[bootstrap] gateway stuck after agents add, forcing restart...");
            sendStatus("Gateway stuck — restarting…");
            const stopRes = await spawnAsync("openclaw", ["gateway", "stop"], 10_000);
            log.info(`[bootstrap] gateway stop: code=${stopRes.code} out="${(stopRes.stdout + stopRes.stderr).trim().slice(0, 120)}"`);
            await new Promise((r) => setTimeout(r, 2000)); // let it fully stop
            // Re-apply config patch — agents add can rewrite openclaw.json without gateway.mode
            try {
              const ocConfigPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
              const raw = await fs.promises.readFile(ocConfigPath, "utf-8");
              const ocConfig = JSON.parse(raw);
              if (!ocConfig.gateway?.mode) {
                ocConfig.gateway = { ...(ocConfig.gateway ?? {}), mode: "local" };
                await fs.promises.writeFile(ocConfigPath, JSON.stringify(ocConfig, null, 2), "utf-8");
                log.info("[bootstrap] patched openclaw.json (post-agents-add): set gateway.mode=local");
              }
            } catch (err) {
              log.warn("[bootstrap] could not patch openclaw.json:", err);
            }
            const startRes = await spawnAsync("openclaw", ["gateway", "start"], 15_000);
            log.info(`[bootstrap] gateway start: code=${startRes.code} out="${(startRes.stdout + startRes.stderr).trim().slice(0, 120)}"`);
          }

          // Phase 3: poll health for up to 20 s after restart
          if (!gatewayReady) {
            for (let i = 0; i < 20; i++) {
              await new Promise((r) => setTimeout(r, 1000));
              sendStatus(`Waiting for gateway to come back… (${i + 1}/20)`);
              if (await isGatewayHealthy()) { gatewayReady = true; break; }
            }
          }

          if (!gatewayReady) {
            steps.push({
              name: "Gateway reload after agent registration",
              status: "failed",
              error: "Gateway did not recover after restart. Run: openclaw gateway restart",
            });
            return { success: false, steps };
          }
          steps.push({ name: "Gateway reload after agent registration", status: "success" });
        }

        // ── Step 6: Schedule heartbeat cron (with retry on gateway crash) ─
        // The gateway occasionally closes (1006) immediately after agent
        // registration. Retry up to 3 times, restarting the gateway between
        // attempts if a connection error is detected.
        const CRON_ARGS = [
          "cron", "add",
          "--agent", payload.agentId,
          "--name", `${payload.agentId}-heartbeat`,
          "--cron", payload.cronSchedule,
          "--session", "isolated",
          "--message", payload.cronMessage,
          "--timeout-seconds", "300",
        ];

        let cronResult = { stdout: "", stderr: "", code: 1 };
        const MAX_CRON_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_CRON_RETRIES; attempt++) {
          cronResult = await spawnAsync("openclaw", CRON_ARGS, 30_000);
          const out = (cronResult.stdout + cronResult.stderr).toLowerCase();
          const isGatewayCrash = out.includes("gateway closed") || out.includes("1006") || out.includes("abnormal closure");

          if (cronResult.code === 0 || out.includes("already")) break; // success or already exists
          if (!isGatewayCrash || attempt === MAX_CRON_RETRIES) break;  // non-retryable or exhausted

          // Gateway crashed — wait up to 8 s for auto-restart, then start explicitly
          log.warn(`[bootstrap] cron add attempt ${attempt} failed (gateway crash), recovering...`);
          let cronGatewayReady = false;
          for (let i = 0; i < 8; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const st = await spawnAsync("openclaw", ["gateway", "status"], 5_000);
            if ((st.stdout + st.stderr).includes("running")) { cronGatewayReady = true; break; }
          }
          if (!cronGatewayReady) {
            await spawnAsync("openclaw", ["gateway", "start"], 15_000);
            for (let i = 0; i < 10; i++) {
              await new Promise((r) => setTimeout(r, 1000));
              const poll = await spawnAsync("openclaw", ["gateway", "health"], 5_000);
              const pollOut = poll.stdout + poll.stderr;
              if (poll.code === 0 && !pollOut.includes("pairing required") && !pollOut.includes("gateway closed")) break;
            }
          }
        }

        const cronOk = cronResult.code === 0;
        const cronOut = (cronResult.stdout + cronResult.stderr).toLowerCase();
        const cronAlreadyExists = !cronOk && cronOut.includes("already");
        steps.push({
          name: "Schedule heartbeat cron",
          status: cronOk ? "success" : cronAlreadyExists ? "skipped" : "failed",
          output: cronResult.stdout || undefined,
          error: cronOk || cronAlreadyExists ? undefined : cronResult.stderr || cronResult.stdout,
        });
        if (!cronOk && !cronAlreadyExists) return { success: false, steps };

        // ── Step 7: Trigger first heartbeat (optional) ──────────────────
        // Requires parsing the cronId from "openclaw cron add" output.
        // Skipped until the output format is confirmed — agent fires on schedule.
        if (payload.triggerImmediately) {
          steps.push({
            name: "Trigger first heartbeat",
            status: "skipped",
            output: "Skipped — cronId parsing not yet confirmed. Agent will fire on its scheduled cron.",
          });
        }

        return { success: true, steps };
      } finally {
        bootstrapInProgress = false;
      }
    }
  );

  // ── Install OpenClaw ─────────────────────────────────────────────────
  // Installs openclaw globally via npm and streams live output to the renderer.
  // The renderer subscribes to 'openclaw-install-progress' IPC events for live log lines.
  // Returns { success: boolean; error?: string }.
  let installInProgress = false;

  ipcMain.handle("install-openclaw", async (event): Promise<{ success: boolean; error?: string }> => {
    if (installInProgress) {
      return { success: false, error: "An install is already in progress." };
    }
    installInProgress = true;

    const sender = event.sender;
    const sendProgress = (chunk: string) => {
      if (!sender.isDestroyed()) {
        sender.send("openclaw-install-progress", chunk);
      }
    };

    try {
      // 1. Verify Node.js / npm is available
      try {
        await spawnAsync("npm", ["--version"], 8_000);
      } catch {
        return {
          success: false,
          error:
            "npm not found. Install Node.js (https://nodejs.org) first, then retry.\n\n" +
            "Tip: if you installed Node via nvm, restart the desktop app after installing.",
        };
      }

      sendProgress("Installing openclaw globally via npm…\n");

      // 2. Run npm install -g openclaw@latest with streaming output
      const result = await spawnWithProgress(
        "npm",
        ["install", "-g", "openclaw@latest"],
        120_000, // 2 minutes — npm can be slow on first install
        sendProgress,
      );

      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout).trim();
        return {
          success: false,
          error: `npm install exited with code ${result.code}:\n${detail}`,
        };
      }

      sendProgress("\nRefreshing PATH…\n");

      // 3. Refresh the PATH cache so the newly installed openclaw is found
      //    without requiring an app restart.
      SHELL_PATH = await resolveShellPathAsync();
      EXTRA_PATHS = buildExtraPaths();

      sendProgress("openclaw installed successfully.\n");
      return { success: true };
    } finally {
      installInProgress = false;
    }
  });

  // ── Install NVM + Node.js ────────────────────────────────────────────
  // Downloads the official nvm install script, runs it, then installs the LTS
  // Node.js release. Progress is streamed via the same 'openclaw-install-progress'
  // channel so the renderer can reuse the same onInstallProgress subscription.
  // Windows is not supported by nvm-sh — returns a helpful error.
  let nvmInstallInProgress = false;

  ipcMain.handle("install-nvm", async (event): Promise<{ success: boolean; error?: string }> => {
    if (nvmInstallInProgress) {
      return { success: false, error: "An install is already in progress." };
    }

    if (process.platform === "win32") {
      return {
        success: false,
        error:
          "Automatic nvm install is not supported on Windows.\n\n" +
          "Please install Node.js from https://nodejs.org, then restart the desktop app and retry.",
      };
    }

    nvmInstallInProgress = true;

    const sender = event.sender;
    const sendProgress = (chunk: string) => {
      if (!sender.isDestroyed()) {
        sender.send("openclaw-install-progress", chunk);
      }
    };

    try {
      // 1. Download the nvm install script to a temp file
      const NVM_VERSION = "v0.40.3";
      const NVM_INSTALL_URL = `https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh`;
      const tmpScript = path.join(os.tmpdir(), `nvm-install-${Date.now()}.sh`);

      sendProgress(`Downloading nvm ${NVM_VERSION} install script…\n`);
      try {
        await downloadFile(NVM_INSTALL_URL, tmpScript);
      } catch (err) {
        return {
          success: false,
          error: `Failed to download nvm install script: ${err instanceof Error ? err.message : String(err)}\n\nCheck your internet connection and retry.`,
        };
      }

      // 2. Run the nvm install script with bash
      sendProgress("Running nvm install script…\n");
      const nvmInstallResult = await spawnWithProgress("bash", [tmpScript], 60_000, sendProgress);
      try { await fs.promises.unlink(tmpScript); } catch { /* cleanup best-effort */ }

      if (nvmInstallResult.code !== 0) {
        return {
          success: false,
          error: `nvm install script failed (exit ${nvmInstallResult.code}):\n${nvmInstallResult.stderr || nvmInstallResult.stdout}`,
        };
      }

      sendProgress("\nnvm installed. Installing latest LTS Node.js…\n");

      // 3. Use nvm to install the latest LTS Node.js.
      //    nvm is a shell function — source it first in the same bash process.
      const nvmDir = path.join(os.homedir(), ".nvm");
      const nvmScript = path.join(nvmDir, "nvm.sh");
      const nodeInstallResult = await spawnWithProgress(
        "bash",
        ["-c", `export NVM_DIR="${nvmDir}" && . "${nvmScript}" && nvm install --lts`],
        120_000,
        sendProgress,
      );

      if (nodeInstallResult.code !== 0) {
        return {
          success: false,
          error: `Node.js install via nvm failed (exit ${nodeInstallResult.code}):\n${nodeInstallResult.stderr || nodeInstallResult.stdout}`,
        };
      }

      sendProgress("\nRefreshing PATH…\n");

      // 4. Refresh the PATH cache so the newly installed node/npm are found.
      SHELL_PATH = await resolveShellPathAsync();
      EXTRA_PATHS = buildExtraPaths();

      sendProgress("Node.js installed via nvm. npm is now available.\n");
      return { success: true };
    } finally {
      nvmInstallInProgress = false;
    }
  });
}

// ── Auto-updater ──────────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;

  // Override the update feed to a public S3/CDN URL so auto-updates work
  // from private GitHub repos. RELEASES_BASE_URL is baked in at build time
  // by esbuild (e.g. https://releases.agentcenter.cloud/desktop).
  // Falls back to the electron-builder.yml publish config when empty (dev).
  const releasesUrl = process.env.RELEASES_BASE_URL;
  if (releasesUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: releasesUrl });
  }

  autoUpdater.on("update-available", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Available",
        message: `AgentCenter ${info.version} is available.`,
        detail: "Would you like to download and install it now?",
        buttons: ["Download", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
  });

  autoUpdater.on("update-downloaded", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: `AgentCenter ${info.version} has been downloaded.`,
        detail: "Restart now to apply the update.",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          setImmediate(() => autoUpdater.quitAndInstall());
        }
      });
  });

  autoUpdater.on("error", (err) => {
    log.error("[autoUpdater] error:", err);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    log.warn("[autoUpdater] check failed:", err);
  });
}

// ── Deep link protocol ────────────────────────────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("agentcenter", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("agentcenter");
}

function handleDeepLink(url: string) {
  const serverUrl = getServerUrl();
  if (!serverUrl || !mainWindow) return;
  try {
    const parsed = new URL(url);
    mainWindow.loadURL(`${serverUrl}${parsed.pathname}${parsed.search}`);
    mainWindow.focus();
  } catch {
    log.warn("[deepLink] invalid URL:", url);
  }
}

// macOS delivers deep links via open-url
app.on("open-url", (_event, url) => {
  handleDeepLink(url);
});

// ── App lifecycle ─────────────────────────────────────────────────────
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // On Windows/Linux, deep links arrive as an argv entry in the second instance
    if (process.platform !== "darwin") {
      const deepLinkUrl = argv.find((arg) => arg.startsWith("agentcenter://"));
      if (deepLinkUrl) handleDeepLink(deepLinkUrl);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Resolve the full login-shell PATH and cache extra paths (nvm, homebrew, etc.)
    // BEFORE registering IPC handlers so every spawn call gets the correct PATH.
    // resolveShellPathAsync() is async — never use execSync here (blocks UI thread).
    SHELL_PATH = await resolveShellPathAsync();
    EXTRA_PATHS = buildExtraPaths();
    log.info("[PATH] resolved SHELL_PATH segments:", SHELL_PATH.split(path.delimiter).length);

    // Set dock icon (macOS only; electron-builder injects it at build time for production)
    if (process.platform === "darwin") {
      const dockIcon = nativeImage.createFromPath(getIconPath("icns"));
      if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon);
    }

    // Override the native About dialog (otherwise shows "Electron" in dev)
    app.setAboutPanelOptions({
      applicationName: "AgentCenter",
      applicationVersion: app.getVersion(),
      copyright: "Copyright © 2026 AgentCenter",
      iconPath: getIconPath(process.platform === "darwin" ? "icns" : "png"),
    });

    setupIPC();

    // Lock down permissions for the persistent session.
    // The web app content can still request camera/mic/notifications through normal
    // browser prompts — we explicitly block openExternal (we handle that ourselves)
    // and anything the app doesn't need (midi, pointerLock, etc.).
    const appSession = session.fromPartition("persist:agentcenter");
    const BLOCKED_PERMISSIONS = new Set(["openExternal", "midi", "midiSysex", "pointerLock"]);
    appSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(!BLOCKED_PERMISSIONS.has(permission));
    });
    appSession.setPermissionCheckHandler((_wc, permission) => {
      return !BLOCKED_PERMISSIONS.has(permission);
    });

    buildAppMenu();
    createTray();

    const serverUrl = getServerUrl();
    if (serverUrl) {
      createMainWindow(serverUrl);
    } else {
      createConfigWindow();
    }

    if (app.isPackaged) setupAutoUpdater();
  });

  app.on("window-all-closed", () => {
    // On macOS, keep the app running in the tray
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    const serverUrl = getServerUrl();
    if (mainWindow === null && serverUrl) {
      createMainWindow(serverUrl);
    } else if (mainWindow === null) {
      createConfigWindow();
    }
  });
}
