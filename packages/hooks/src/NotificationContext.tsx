import { createContext, useContext } from "react";
import { useNotifications } from "./useNotifications";
import type { UseNotificationsResult } from "./useNotifications";

// ── Context ────────────────────────────────────────────────────────────────────

const NotificationContext = createContext<UseNotificationsResult>({
  notifications: [],
  unreadCount: 0,
  fetching: false,
  error: false,
  reexecute: () => {},
  markOneRead: () => {},
  markAllRead: () => {},
});

// ── Provider ───────────────────────────────────────────────────────────────────

interface NotificationCountProviderProps {
  /** Pass `""` on web (relative fetch), full URL on mobile/Electron. */
  serverUrl: string;
  /** When false, polling is paused and fetches are skipped. */
  isSignedIn: boolean;
  children: React.ReactNode;
}

export function NotificationCountProvider({
  serverUrl,
  isSignedIn,
  children,
}: NotificationCountProviderProps) {
  const value = useNotifications(serverUrl, isSignedIn && !!serverUrl);
  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

// ── Consumer hooks ─────────────────────────────────────────────────────────────

/** Returns the number of unread notifications. */
export function useNotificationCount(): number {
  return useContext(NotificationContext).unreadCount;
}

/** Returns the full notifications state from context. */
export function useNotificationsContext(): UseNotificationsResult {
  return useContext(NotificationContext);
}
