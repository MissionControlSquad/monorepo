import { useState, useCallback } from "react";
import {
  fetchUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  NOTIFICATION_POLL_INTERVAL_MS,
} from "@agentcenter/utils";
import { usePollingInterval } from "./usePollingInterval";
import type { NotificationItem } from "@agentcenter/types";

export interface UseNotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  fetching: boolean;
  error: boolean;
  reexecute: () => void;
  markOneRead: (id: string) => void;
  markAllRead: () => void;
}

/**
 * Universal notification state hook — works in React (web/Electron) and React Native.
 *
 * Polls for notifications every NOTIFICATION_POLL_INTERVAL_MS when enabled.
 * Provides optimistic mark-read helpers.
 *
 * @param serverUrl  Pass `""` on web (relative fetch), full URL on mobile/Electron.
 * @param enabled    Set to false when user is not signed in or serverUrl is unknown.
 */
export function useNotifications(
  serverUrl: string,
  enabled: boolean,
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      setFetching(true);
      const items = await fetchUserNotifications(serverUrl);
      setNotifications(items);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setFetching(false);
    }
  }, [serverUrl, enabled]);

  const markOneRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      await markNotificationRead(serverUrl, id);
    },
    [serverUrl],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    await markAllNotificationsRead(serverUrl);
  }, [serverUrl]);

  const reexecute = usePollingInterval(fetchNotifications, NOTIFICATION_POLL_INTERVAL_MS, enabled);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, fetching, error, reexecute, markOneRead, markAllRead };
}
