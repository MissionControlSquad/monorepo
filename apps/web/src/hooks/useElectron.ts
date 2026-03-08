"use client";

import { useSyncExternalStore } from "react";

function getIsElectron() {
  return typeof window !== "undefined" && !!window.electronAPI?.isElectron;
}

const subscribe = () => () => {};

/** Returns `true` when running inside the Electron desktop app. */
export function useIsElectron(): boolean {
  return useSyncExternalStore(subscribe, getIsElectron, () => false);
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
