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

  /**
   * Install openclaw globally via npm with live progress streaming.
   * Subscribe via onInstallProgress first, then call this.
   */
  installOpenclaw(): Promise<{ success: boolean; error?: string }>;

  /**
   * Install nvm + latest LTS Node.js (macOS/Linux only).
   * Subscribe via onInstallProgress first, then call this.
   */
  installNvm(): Promise<{ success: boolean; error?: string }>;

  /**
   * Subscribe to live install output chunks (shared by installOpenclaw + installNvm).
   * Returns an unsubscribe function — call it when the install is done.
   */
  onInstallProgress(callback: (chunk: string) => void): () => void;

  /**
   * Subscribe to live bootstrap status messages (gateway wait progress, etc).
   * Returns an unsubscribe function.
   */
  onBootstrapStatus(callback: (message: string) => void): () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
