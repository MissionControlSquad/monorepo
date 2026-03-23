import { createContext, useContext, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import {
  NOTIFICATION_POLL_INTERVAL_MS,
  fetchUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@agentcenter/utils";
import { usePollingInterval } from "@agentcenter/hooks";
import type { NotificationItem } from "@agentcenter/types";

interface NotificationContextValue {
  count: number;
  notifications: NotificationItem[];
  fetching: boolean;
  error: boolean;
  reexecute: () => void;
  markOneRead: (id: string) => void;
  markAllRead: () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue>({
  count: 0,
  notifications: [],
  fetching: false,
  error: false,
  reexecute: () => {},
  markOneRead: () => {},
  markAllRead: () => {},
});

// ── Provider ───────────────────────────────────────────────────────────────────

export function NotificationCountProvider({ children }: { children: React.ReactNode }) {
  const { serverUrl, isSignedIn } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!serverUrl || !isSignedIn) return;
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
  }, [serverUrl, isSignedIn]);

  const markOneRead = useCallback(async (id: string) => {
    if (!serverUrl) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    await markNotificationRead(serverUrl, id);
  }, [serverUrl]);

  const markAllRead = useCallback(async () => {
    if (!serverUrl) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    await markAllNotificationsRead(serverUrl);
  }, [serverUrl]);

  // Initial fetch + polling
  const reexecute = usePollingInterval(
    fetchNotifications,
    NOTIFICATION_POLL_INTERVAL_MS,
    isSignedIn && !!serverUrl,
  );

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <NotificationContext.Provider
      value={{
        count: unreadCount,
        notifications,
        fetching,
        error,
        reexecute: fetchNotifications,
        markOneRead,
        markAllRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useNotificationCount(): number {
  return useContext(NotificationContext).count;
}

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}
