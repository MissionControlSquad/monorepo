import type { NotificationItem } from "@agentcenter/types";

/**
 * Notification REST API helpers.
 *
 * All functions accept `serverUrl` so they work universally:
 * - Web (Next.js): pass `""` — fetch uses relative paths, credentials:"include" sends cookie
 * - Mobile / Electron: pass the full server URL AND `getCookie` — React Native ignores
 *   `credentials:"include"` so the session cookie must be injected as an explicit header.
 */

function notificationHeaders(getCookie?: () => string | null): Record<string, string> {
  const cookie = getCookie?.();
  return cookie ? { Cookie: `mc_session=${cookie}` } : {};
}

export async function fetchUserNotifications(
  serverUrl: string,
  limit = 50,
  getCookie?: () => string | null,
): Promise<NotificationItem[]> {
  const res = await fetch(`${serverUrl}/api/user-notifications?limit=${limit}`, {
    credentials: "include",
    headers: notificationHeaders(getCookie),
  });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  const data = await res.json();
  return (data.notifications ?? []) as NotificationItem[];
}

export async function fetchUnreadNotificationCount(
  serverUrl: string,
  getCookie?: () => string | null,
): Promise<number> {
  const res = await fetch(`${serverUrl}/api/user-notifications/unread-count`, {
    credentials: "include",
    headers: notificationHeaders(getCookie),
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return (data.count as number) ?? 0;
}

/**
 * Optimistically mark a single notification as read.
 * Silently ignores network failures (caller should apply optimistic UI update first).
 */
export async function markNotificationRead(
  serverUrl: string,
  id: string,
  getCookie?: () => string | null,
): Promise<void> {
  try {
    await fetch(`${serverUrl}/api/user-notifications/${id}/read`, {
      method: "PATCH",
      credentials: "include",
      headers: notificationHeaders(getCookie),
    });
  } catch {
    // silent fail — caller applies optimistic update
  }
}

/**
 * Mark all notifications as read.
 * Silently ignores network failures.
 */
export async function markAllNotificationsRead(
  serverUrl: string,
  getCookie?: () => string | null,
): Promise<void> {
  try {
    await fetch(`${serverUrl}/api/user-notifications/read-all`, {
      method: "PATCH",
      credentials: "include",
      headers: notificationHeaders(getCookie),
    });
  } catch {
    // silent fail
  }
}
