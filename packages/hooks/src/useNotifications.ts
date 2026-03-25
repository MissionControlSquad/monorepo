import { useState, useCallback, useRef } from "react";
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
  hasMore: boolean;
  reexecute: () => void;
  loadMore: () => void;
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
 * @param getCookie  React Native only: callback returning the session cookie value.
 *                   React Native ignores `credentials:"include"` so the cookie must
 *                   be injected as an explicit header. On web, omit this.
 */
export function useNotifications(
  serverUrl: string,
  enabled: boolean,
  getCookie?: () => string | null,
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const limitRef = useRef(50);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      setFetching(true);
      const items = await fetchUserNotifications(serverUrl, limitRef.current, getCookie);
      setNotifications(items);
      setHasMore(items.length >= limitRef.current);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setFetching(false);
    }
  }, [serverUrl, enabled, getCookie]);

  const markOneRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      await markNotificationRead(serverUrl, id, getCookie);
    },
    [serverUrl, getCookie],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    await markAllNotificationsRead(serverUrl, getCookie);
  }, [serverUrl, getCookie]);

  const reexecute = usePollingInterval(fetchNotifications, NOTIFICATION_POLL_INTERVAL_MS, enabled);

  const loadMore = useCallback(() => {
    limitRef.current += 50;
    fetchNotifications();
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, fetching, error, hasMore, reexecute, loadMore, markOneRead, markAllRead };
}
