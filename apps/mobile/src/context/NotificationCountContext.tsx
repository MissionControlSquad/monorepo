import { createContext, useContext, useEffect, useRef } from "react";
import { useQuery, useSubscription } from "urql";
import { UNDELIVERED_NOTIFICATIONS_QUERY, ON_NOTIFICATION } from "@agentcenter/graphql-client";
import { useAuth } from "./AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  mentionedAgentId: string;
  content: string;
  taskId: string | null;
  messageId: string | null;
  delivered: boolean;
  deliveredAt: string | null;
  createdAt: string;
  mentionedAgent: { id: string; name: string; identityEmoji: string | null };
  task: { id: string; title: string; taskNumber: number; status: string } | null;
}

interface NotificationContextValue {
  count: number;
  notifications: NotificationItem[];
  fetching: boolean;
  error: boolean;
  reexecute: (opts?: { requestPolicy: "network-only" }) => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue>({
  count: 0,
  notifications: [],
  fetching: false,
  error: false,
  reexecute: () => {},
});

// ── Provider ───────────────────────────────────────────────────────────────────

/**
 * Runs UNDELIVERED_NOTIFICATIONS_QUERY exactly once for the whole app.
 * Both NotificationsScreen and AppDrawer / NotificationBell read from this
 * context instead of issuing their own duplicate queries.
 */
export function NotificationCountProvider({ children }: { children: React.ReactNode }) {
  const { profileId } = useAuth();

  const [result, reexecute] = useQuery<{ undeliveredNotifications: NotificationItem[] }>({
    query: UNDELIVERED_NOTIFICATIONS_QUERY,
    requestPolicy: "network-only",
    pause: !profileId,
  });

  const [subResult] = useSubscription<{ notification: { id: string } }>({
    query: ON_NOTIFICATION,
    variables: { profileId: profileId ?? "" },
    pause: !profileId,
  });

  const prevSubData = useRef<unknown>(null);
  useEffect(() => {
    if (subResult.data && subResult.data !== prevSubData.current) {
      prevSubData.current = subResult.data;
      reexecute({ requestPolicy: "network-only" });
    }
  }, [subResult.data, reexecute]);

  const notifications = result.data?.undeliveredNotifications ?? [];

  return (
    <NotificationContext.Provider
      value={{
        count: notifications.length,
        notifications,
        fetching: result.fetching,
        error: !!result.error,
        reexecute,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useNotificationCount(): number {
  return useContext(NotificationContext).count;
}

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}
