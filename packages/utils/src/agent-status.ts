import { HEARTBEAT_TIMEOUT_MS, AGENT_DETAILED_STATUSES, STATUS_HEX_COLORS } from "./constants";
import { SetupStatus } from "./domain-constants";
import { DEFAULT_COLOR } from "./defaults";
import { humanizeLabel } from "./format";

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
 * Get the hex status color for an agent, preferring detailedStatus over status.
 * Uses STATUS_HEX_COLORS which covers all agent statuses and detailed statuses.
 */
export function getAgentStatusColor(agent: {
  status: string;
  detailedStatus?: string | null;
}): string {
  if (agent.detailedStatus && STATUS_HEX_COLORS[agent.detailedStatus]) {
    return STATUS_HEX_COLORS[agent.detailedStatus];
  }
  return STATUS_HEX_COLORS[agent.status] ?? DEFAULT_COLOR;
}

/**
 * Get a human-readable status label for an agent.
 * Uses AGENT_DETAILED_STATUSES labels where available, otherwise humanizes the raw value.
 */
export function getAgentStatusLabel(agent: {
  status: string;
  detailedStatus?: string | null;
  isOnVacation?: boolean;
}): string {
  if (agent.isOnVacation) return "On Vacation";
  if (agent.detailedStatus) {
    const entry = AGENT_DETAILED_STATUSES[agent.detailedStatus as keyof typeof AGENT_DETAILED_STATUSES];
    if (entry) return entry.label;
    return humanizeLabel(agent.detailedStatus);
  }
  return agent.status.charAt(0).toUpperCase() + agent.status.slice(1);
}

/** Filter tab for setup-status-based agent filtering. */
export type AgentSetupFilter = "all" | "active" | "pending" | "deactivated";

/**
 * Filter agents by setup status and a search query (matches name or role).
 * Pure function — safe everywhere.
 */
export function filterAgentsBySetup<
  T extends { name: string; role?: string | null; setupStatus: string },
>(agents: T[], filter: AgentSetupFilter, search: string): T[] {
  let list = agents;
  if (filter === "active") list = list.filter((a) => a.setupStatus === SetupStatus.ACTIVE);
  else if (filter === "pending") list = list.filter((a) => a.setupStatus === SetupStatus.PENDING_SETUP);
  else if (filter === "deactivated") list = list.filter((a) => a.setupStatus === SetupStatus.DEACTIVATED);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.role ?? "").toLowerCase().includes(q),
    );
  }
  return list;
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
