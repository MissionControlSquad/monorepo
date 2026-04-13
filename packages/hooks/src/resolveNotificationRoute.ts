/**
 * Derive the in-app route to navigate to from a push notification payload.
 * Pure function — no router dependency, works in any environment.
 *
 * Usage (mobile):
 *   import { resolveNotificationRoute } from "@agentcenter/hooks";
 *   router.push(resolveNotificationRoute(data) as any);
 */
export function resolveNotificationRoute(data: Record<string, unknown>): string {
  if (data.taskId) return `/task/${data.taskId}`;
  if (data.channelId) return `/channels/${data.channelId}`;
  if (data.projectId) return `/project/${data.projectId}`;
  return "/notifications";
}
