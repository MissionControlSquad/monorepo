import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  /** Whether the app is running inside Electron */
  isElectron: true,

  /** Execute an allowlisted openclaw CLI command */
  execute: (args: string[]): Promise<{ stdout: string; stderr: string; code: number }> =>
    ipcRenderer.invoke("execute-openclaw", args),

  /** Set the server URL (used by the config window) */
  setServerUrl: (url: string): void => ipcRenderer.send("set-server-url", url),
});
