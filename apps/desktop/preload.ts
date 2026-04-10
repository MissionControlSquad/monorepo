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
});
