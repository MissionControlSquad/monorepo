/**
 * Central place for all agent status-related updates.
 * Every change to status, setupStatus, currentTask, etc. goes through here.
 *
 * Call sites (when status gets updated):
 * - events/handlers/agentState.ts — agent.woke_up, agent.went_to_sleep, agent.status_changed
 * - events/ingest.ts — agent.sync_identity, agent.heartbeat, agent.action_logged
 * - graphql/mutations/agents.ts — updateAgentStatus (via emit → agentState), agentHeartbeat, setAgentActivation, syncAgentIdentity
 * - graphql/mutations/agent-actions.ts — logAgentAction
 * - events/handlers/subscription.ts — task.assignees_changed (clear currentTask for removed assignees)
 * - events/handlers/cleanup.ts — task.deleted (clearCurrentTaskForAgentsWithTask)
 * - api/cron/auto-sleep/route.ts — auto-sleep cron (stale heartbeat → idle)
 *
 * When a direct update changes status (idle/active/blocked), we emit agent.status_applied
 * so statusHistory and activity handlers can record it (agentState does not listen).
 */
import {
  updateAgent,
  updateAgentStatusAtomically,
  getAgentApiKeyHash,
  findAgentsByCurrentTaskId,
} from "@agentcenter/database";
import { pubsub, PubSubEvent } from "./pubsub";
import { emit } from "./events/bus";
import { EventTypes } from "./constants";
import type { AgentStatusValue, SetupStatusValue } from "./constants";
import { invalidateAgentCache } from "./cache";

/**
 * Fields that represent a meaningful status change (triggers pubsub to all UI clients).
 * `lastHeartbeat` is intentionally excluded — it updates too frequently (every heartbeat)
 * and would cause O(N*M) wasted DB queries + refetches. The 15-second client-side
 * interval in AgentStatusContext already drives online/offline display.
 */
const SEMANTIC_STATUS_KEYS = [
  "status",
  "setupStatus",
  "detailedStatus",
  "statusMessage",
  "currentTaskId",
  "currentTask",
] as const;

/**
 * Maps a logged agent action type → the inferred `detailedStatus` shown in the UI.
 * Consumed when an agent logs an action (GraphQL `logAgentAction` and the
 * `agent.action_logged` event ingest path), so both surfaces stay in lock-step.
 */
export const ACTION_TO_DETAILED_STATUS: Record<string, string> = {
  file_edited: "coding",
  code_written: "coding",
  command_executed: "coding",
  file_opened: "coding",
  research_done: "researching",
  thinking: "thinking",
  reviewing: "reviewing",
  deploying: "deploying",
  testing: "testing",
  writing_docs: "writing",
};

export type AgentStatusUpdate = {
  status?: AgentStatusValue;
  setupStatus?: SetupStatusValue;
  detailedStatus?: string | null;
  statusMessage?: string | null;
  currentTaskId?: string | null;
  currentTask?: string | null;
  lastHeartbeat?: Date | null;
  isOnVacation?: boolean;
  // Allow identity/other fields when we do a single write (e.g. sync_identity)
  name?: string;
  avatar?: string | null;
  personality?: string | null;
  workspacePath?: string | null;
  identityEmoji?: string | null;
  username?: string | null;
};

/**
 * Update agent with the given data and publish AGENT.STATUS_CHANGED when any
 * status-related field is included. When a direct update changes runtime status
 * (idle/active/blocked), emits agent.status_applied for statusHistory and activity.
 */
export async function applyAgentStatusUpdate(
  agentId: string,
  data: AgentStatusUpdate,
): Promise<void> {
  const updateData = data as Record<string, unknown>;
  const statusInPayload = "status" in data && data.status != null;

  let previous: { status: string; detailedStatus: string | null; name: string } | undefined;

  if (statusInPayload) {
    // Use a transaction to atomically read previous status and apply the update,
    // preventing a concurrent process from changing status between read and write.
    previous = await updateAgentStatusAtomically(agentId, updateData);
  } else {
    await updateAgent(agentId, updateData);
  }

  // So REST resolveAgent() sees fresh setupStatus (avoids 403 after sync_identity or reactivate)
  if ("setupStatus" in data && data.setupStatus != null) {
    const row = await getAgentApiKeyHash(agentId);
    if (row?.apiKeyHash) invalidateAgentCache(row.apiKeyHash);
  }

  const hasSemanticChange = SEMANTIC_STATUS_KEYS.some((key) => key in data);
  if (hasSemanticChange) {
    pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId });
  }

  if (statusInPayload && previous && (data.status as string) !== previous.status) {
    await emit({
      type: EventTypes.AGENT_STATUS_APPLIED,
      agentId,
      agentName: previous.name,
      fromStatus: previous.status as AgentStatusValue,
      toStatus: data.status as AgentStatusValue,
      fromDetailedStatus: previous.detailedStatus ?? undefined,
      toDetailedStatus:
        data.detailedStatus !== undefined ? (data.detailedStatus as string | undefined) : undefined,
      statusMessage: data.statusMessage ?? undefined,
    });
  }
}

/**
 * Clear currentTaskId/currentTask for all agents that had the given task.
 * Used when a task is deleted.
 */
export async function clearCurrentTaskForAgentsWithTask(taskId: string): Promise<void> {
  const agents = await findAgentsByCurrentTaskId(taskId);
  for (const agent of agents) {
    await applyAgentStatusUpdate(agent.id, {
      currentTaskId: null,
      currentTask: null,
    });
  }
}
