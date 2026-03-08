import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  shell,
  nativeImage,
} from "electron";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import path from "path";
import { spawn } from "child_process";

// ── Persistent config store ───────────────────────────────────────────
const store = new Store<{ serverUrl: string; windowBounds: Electron.Rectangle }>(
  { name: "agentcenter-config" }
);

let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ── Helpers ───────────────────────────────────────────────────────────
function getServerUrl(): string | undefined {
  return store.get("serverUrl") as string | undefined;
}

function saveWindowBounds() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    store.set("windowBounds", mainWindow.getBounds());
  }
}

// ── Config (first-launch) window ──────────────────────────────────────
function createConfigWindow() {
  configWindow = new BrowserWindow({
    width: 480,
    height: 300,
    resizable: false,
    title: "AgentCenter — Server Configuration",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const currentUrl = getServerUrl() || "";

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
  const savedBounds = store.get("windowBounds") as
    | Electron.Rectangle
    | undefined;

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1280,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    title: "AgentCenter",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:agentcenter",
    },
  });

  mainWindow.loadURL(serverUrl);

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const serverOrigin = new URL(serverUrl).origin;
    if (!url.startsWith(serverOrigin)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("resize", saveWindowBounds);
  mainWindow.on("move", saveWindowBounds);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── System tray ───────────────────────────────────────────────────────
function createTray() {
  // Use a template image for macOS menu bar (16x16)
  const icon = nativeImage.createFromNamedImage(
    "NSImageNameApplicationIcon",
    [-1, 0, 1]
  );
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
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
      label: app.name,
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
        { role: "toggleDevTools" },
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

function setupIPC() {
  // Config window: set server URL
  ipcMain.on("set-server-url", (_event, url: string) => {
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
          env: { ...process.env },
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        child.on("error", (err) => reject(err));
        child.on("close", (code) => {
          resolve({ stdout, stderr, code: code ?? 1 });
        });
      });
    }
  );
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

app.on("open-url", (_event, url) => {
  if (mainWindow) {
    const parsed = new URL(url);
    const serverUrl = getServerUrl();
    if (serverUrl) {
      mainWindow.loadURL(`${serverUrl}${parsed.pathname}${parsed.search}`);
      mainWindow.focus();
    }
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, _argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupIPC();
    buildAppMenu();
    createTray();

    const serverUrl = getServerUrl();
    if (serverUrl) {
      createMainWindow(serverUrl);
    } else {
      createConfigWindow();
    }

    // Auto-updater (silent check)
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // Silently ignore update errors (e.g. no internet, no release)
    });
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
