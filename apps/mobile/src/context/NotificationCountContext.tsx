import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { NOTIFICATION_POLL_INTERVAL_MS } from "@agentcenter/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!serverUrl || !isSignedIn) return;
    try {
      setFetching(true);
      const res = await fetch(`${serverUrl}/api/user-notifications?limit=50`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
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
    try {
      await fetch(`${serverUrl}/api/user-notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch {
      // silent fail — optimistic update already applied
    }
  }, [serverUrl]);

  const markAllRead = useCallback(async () => {
    if (!serverUrl) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    try {
      await fetch(`${serverUrl}/api/user-notifications/read-all`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch {
      // silent fail
    }
  }, [serverUrl]);

  // Initial fetch + polling
  useEffect(() => {
    if (!isSignedIn || !serverUrl) return;
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, NOTIFICATION_POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSignedIn, serverUrl, fetchNotifications]);

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
