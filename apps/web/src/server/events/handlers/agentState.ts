import { on } from "../bus";
import { pubsub, PubSubEvent } from "../../pubsub";
import { applyAgentStatusUpdate } from "../../agent-status";
import { EventTypes, AgentStatus, type AgentStatusValue } from "../../constants";

// Must be first handler — patches agent record before other handlers read it.
// All status updates go through applyAgentStatusUpdate (centralized in agent-status.ts).

on(EventTypes.AGENT_WOKE_UP, async (event) => {
  await applyAgentStatusUpdate(event.agentId, {
    status: AgentStatus.ACTIVE,
    detailedStatus: (event.detailedStatus as string) ?? "thinking",
    currentTaskId: event.currentTaskId ?? undefined,
    currentTask: event.currentTask ?? undefined,
    lastHeartbeat: new Date(),
  });
});

on(EventTypes.AGENT_WENT_TO_SLEEP, async (event) => {
  await applyAgentStatusUpdate(event.agentId, {
    status: AgentStatus.IDLE,
    detailedStatus: null,
    statusMessage: null,
    currentTaskId: null,
    currentTask: null,
    lastHeartbeat: new Date(),
  });
});

on(EventTypes.AGENT_STATUS_CHANGED, async (event) => {
  // When transitioning to idle, always clear current task so the agent can pick new work.
  // (If the agent omits currentTaskId/currentTask in the payload, we still clear them.)
  const toIdle = event.toStatus === AgentStatus.IDLE;
  await applyAgentStatusUpdate(event.agentId, {
    status: event.toStatus as AgentStatusValue,
    detailedStatus: toIdle ? null : ((event.toDetailedStatus as string) ?? undefined),
    statusMessage: event.statusMessage ?? undefined,
    currentTaskId: toIdle ? null : (event.currentTaskId ?? undefined),
    currentTask: toIdle ? null : (event.currentTask ?? undefined),
    lastHeartbeat: new Date(),
  });
});

on(EventTypes.AGENT_JOINED, async (event) => {
  pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: event.agentId });
});
