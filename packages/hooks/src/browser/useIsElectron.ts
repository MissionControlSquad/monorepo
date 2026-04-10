import { useState, useEffect } from "react";

export interface BootstrapAgentPayload {
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

export interface BootstrapStep {
  name: string;
  status: "success" | "failed" | "skipped";
  output?: string;
  error?: string;
}

export interface BootstrapResult {
  success: boolean;
  steps: BootstrapStep[];
}

export interface ElectronAPI {
  isElectron: true;
  /** OS platform string: 'darwin' | 'win32' | 'linux' */
  platform: string;
  execute: (args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
  /** One-click agent bootstrap: writes config files, registers agent, schedules cron */
  bootstrapAgent: (payload: BootstrapAgentPayload) => Promise<BootstrapResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/** Returns `true` when running inside the Electron desktop app. */
export function useIsElectron(): boolean {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // Runs after hydration — window.electronAPI is injected by the preload
    // script before the page loads, so it is always available by this point.
    setIsElectron(!!window.electronAPI?.isElectron);
  }, []);

  return isElectron;
}

/** Run an allowlisted openclaw CLI command via the Electron IPC bridge. */
export async function runOpenClaw(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  if (!window.electronAPI) {
    throw new Error("Not running in Electron — openclaw bridge unavailable");
  }
  return window.electronAPI.execute(args);
}
