import { useState, useEffect, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { getStoredServerUrl } from "../api/session";
import { checkNetworkHealth } from "@agentcenter/utils";

/**
 * Pings the server health endpoint when the app comes to foreground.
 * Returns { isOnline, checkNow }.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  const check = useCallback(async () => {
    const serverUrl = getStoredServerUrl();
    if (!serverUrl) return;
    const online = await checkNetworkHealth(serverUrl);
    setIsOnline(online);
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
