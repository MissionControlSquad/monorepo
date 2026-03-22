import { useState, useEffect, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { getStoredServerUrl } from "../api/session";

/**
 * Lightweight network connectivity check — no external dependencies.
 * Pings the /api/health endpoint when the app comes to foreground.
 * Returns { isOnline, checkNow }
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  const check = useCallback(async () => {
    const serverUrl = getStoredServerUrl();
    if (!serverUrl) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${serverUrl}/api/health`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);
      setIsOnline(res.ok || res.status < 500);
    } catch {
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, [check]);

  return { isOnline, checkNow: check };
}
