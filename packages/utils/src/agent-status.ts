import { HEARTBEAT_TIMEOUT_MS } from "./constants";

/**
 * Pure agent online-status helpers.
 * No React, no DOM, no React Native — safe everywhere.
 */

/**
 * Returns true when the agent's last heartbeat is within the timeout window.
 */
export function isAgentOnline(
  lastHeartbeat: string | number | null | undefined,
  now = Date.now(),
  timeoutMs = HEARTBEAT_TIMEOUT_MS,
): boolean {
  if (!lastHeartbeat) return false;
  const ts =
    typeof lastHeartbeat === "number" ? lastHeartbeat : new Date(lastHeartbeat).getTime();
  return now - ts < timeoutMs;
}

/**
 * Returns milliseconds since the last heartbeat, or Infinity if never seen.
 */
export function timeSinceHeartbeat(
  lastHeartbeat: string | number | null | undefined,
  now = Date.now(),
): number {
  if (!lastHeartbeat) return Infinity;
  const ts =
    typeof lastHeartbeat === "number" ? lastHeartbeat : new Date(lastHeartbeat).getTime();
  return now - ts;
}
