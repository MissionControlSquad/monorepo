import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  /** Whether the app is running inside Electron */
  isElectron: true,

  /**
   * Current OS platform — lets the web app apply platform-specific styles
   * (e.g. padding-top for macOS traffic lights).
   */
  platform: process.platform,

  /** Execute an allowlisted openclaw CLI command */
  execute: (args: string[]): Promise<{ stdout: string; stderr: string; code: number }> =>
    ipcRenderer.invoke("execute-openclaw", args),

  /** Set the server URL (used by the config window) */
  setServerUrl: (url: string): void => ipcRenderer.send("set-server-url", url),

  /** One-click agent bootstrap: writes config files, registers agent, schedules cron */
  bootstrapAgent: (payload: BootstrapAgentPayload): Promise<BootstrapResult> =>
    ipcRenderer.invoke("bootstrap-agent", payload),

  /**
   * Install openclaw globally via npm.
   * Subscribe to live output first via onInstallProgress, then call this.
   * Returns { success: boolean; error?: string }.
   */
  installOpenclaw: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("install-openclaw"),

  /**
   * Install nvm + latest LTS Node.js (macOS/Linux only).
   * Subscribe to live output first via onInstallProgress, then call this.
   * Returns { success: boolean; error?: string }.
   */
  installNvm: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("install-nvm"),

  /**
   * Subscribe to live install output chunks (shared by installOpenclaw + installNvm).
   * Returns an unsubscribe function — call it when the install is done.
   */
  onInstallProgress: (callback: (chunk: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on("openclaw-install-progress", listener);
    return () => ipcRenderer.removeListener("openclaw-install-progress", listener);
  },

  /**
   * Subscribe to live bootstrap status messages (gateway wait progress, etc).
   * Returns an unsubscribe function.
   */
  onBootstrapStatus: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("bootstrap-status", listener);
    return () => ipcRenderer.removeListener("bootstrap-status", listener);
  },
});
