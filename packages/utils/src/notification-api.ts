import type { NotificationItem } from "@agentcenter/types";

/**
 * Notification REST API helpers.
 *
 * All functions accept `serverUrl` so they work universally:
 * - Web (Next.js): pass `""` — fetch uses relative paths
 * - Mobile / Electron: pass the full server URL (e.g. "https://my.server.com")
 *
 * All requests include `credentials: "include"` so the session cookie is sent.
 */

export async function fetchUserNotifications(
  serverUrl: string,
  limit = 50,
): Promise<NotificationItem[]> {
  const res = await fetch(`${serverUrl}/api/user-notifications?limit=${limit}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  const data = await res.json();
  return (data.notifications ?? []) as NotificationItem[];
}

export async function fetchUnreadNotificationCount(serverUrl: string): Promise<number> {
  const res = await fetch(`${serverUrl}/api/user-notifications/unread-count`, {
    credentials: "include",
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return (data.count as number) ?? 0;
}

/**
 * Optimistically mark a single notification as read.
 * Silently ignores network failures (caller should apply optimistic UI update first).
 */
export async function markNotificationRead(serverUrl: string, id: string): Promise<void> {
  try {
    await fetch(`${serverUrl}/api/user-notifications/${id}/read`, {
      method: "PATCH",
      credentials: "include",
    });
  } catch {
    // silent fail — caller applies optimistic update
  }
}

/**
 * Mark all notifications as read.
 * Silently ignores network failures.
 */
export async function markAllNotificationsRead(serverUrl: string): Promise<void> {
  try {
    await fetch(`${serverUrl}/api/user-notifications/read-all`, {
      method: "PATCH",
      credentials: "include",
    });
  } catch {
    // silent fail
  }
}
