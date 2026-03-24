/**
 * Mobile auth bridge for the shared NotificationCountProvider.
 * Reads serverUrl / isSignedIn from AuthContext and passes them to the
 * platform-agnostic provider from @agentcenter/hooks.
 */
import {
  NotificationCountProvider as SharedNotificationCountProvider,
  useNotificationCount,
  useNotificationsContext,
} from "@agentcenter/hooks";
import { useAuth } from "./AuthContext";

export { useNotificationCount, useNotificationsContext as useNotifications };

export function NotificationCountProvider({ children }: { children: React.ReactNode }) {
  const { serverUrl, isSignedIn } = useAuth();
  return (
    <SharedNotificationCountProvider serverUrl={serverUrl ?? ""} isSignedIn={isSignedIn}>
      {children}
    </SharedNotificationCountProvider>
  );
}
