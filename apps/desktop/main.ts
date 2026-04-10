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
import { spawn } from "child_process";

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
  return safe;
}

const SPAWN_MAX_BYTES = 32 * 1024; // 32 KB cap per stream

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

      return new Promise((resolve, reject) => {
        const child = spawn("openclaw", args, {
          timeout: 30_000,
          env: buildSafeEnv(),
        });

        let stdout = "";
        let stderr = "";
        let stdoutBytes = 0;
        let stderrBytes = 0;

        child.stdout.on("data", (data: Buffer) => {
          stdoutBytes += data.length;
          if (stdoutBytes <= SPAWN_MAX_BYTES) {
            stdout += data.toString();
          }
        });
        child.stderr.on("data", (data: Buffer) => {
          stderrBytes += data.length;
          if (stderrBytes <= SPAWN_MAX_BYTES) {
            stderr += data.toString();
          }
        });

        child.on("error", (err) => reject(err));
        child.on("close", (code) => {
          resolve({ stdout, stderr, code: code ?? 1 });
        });
      });
    }
  );
}

// ── Auto-updater ──────────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;

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

  app.whenReady().then(() => {
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
