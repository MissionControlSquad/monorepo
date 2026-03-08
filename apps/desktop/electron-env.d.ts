interface ElectronAPI {
  /** Whether the app is running inside Electron */
  isElectron: boolean;

  /** Execute an allowlisted openclaw CLI command */
  execute(args: string[]): Promise<{ stdout: string; stderr: string; code: number }>;

  /** Set the server URL (used by the config window) */
  setServerUrl(url: string): void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
