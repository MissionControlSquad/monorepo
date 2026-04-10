interface ElectronAPI {
  /** Whether the app is running inside Electron */
  isElectron: boolean;

  /**
   * Current OS platform ('darwin' | 'win32' | 'linux').
   * Use this to apply platform-specific styles, e.g. top padding on macOS
   * to clear the traffic-light buttons:
   *   if (window.electronAPI?.platform === 'darwin') { ... }
   */
  platform: string;

  /** Execute an allowlisted openclaw CLI command */
  execute(args: string[]): Promise<{ stdout: string; stderr: string; code: number }>;

  /** Set the server URL (used by the config window) */
  setServerUrl(url: string): void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
