interface BootstrapAgentPayload {
  agentId: string;
  agentName: string;
  /** May start with "~" — the main process expands it via os.homedir(). */
  workspacePath: string;
  /** Bare filenames only (e.g. "IDENTITY.md") — no path separators. */
  configFiles: Array<{ filename: string; content: string }>;
  /** CLIs verified before any filesystem writes. Server declares what's needed. */
  requiredClis: string[];
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
  /** Whether the app is running inside Electron */
  isElectron: true;

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

  /** One-click agent bootstrap: writes config files, registers agent, schedules cron */
  bootstrapAgent(payload: BootstrapAgentPayload): Promise<BootstrapResult>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
