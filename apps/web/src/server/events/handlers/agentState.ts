import { on } from "../bus";
import { pubsub, PubSubEvent } from "../../pubsub";
import { applyAgentStatusUpdate } from "../../agent-status";

// Must be first handler — patches agent record before other handlers read it.
// All status updates go through applyAgentStatusUpdate (centralized in agent-status.ts).

on("agent.woke_up", async (event) => {
  await applyAgentStatusUpdate(event.agentId, {
    status: "active",
    detailedStatus: (event.detailedStatus as string) ?? "thinking",
    currentTaskId: event.currentTaskId ?? undefined,
    currentTask: event.currentTask ?? undefined,
    lastHeartbeat: new Date(),
  });
});

on("agent.went_to_sleep", async (event) => {
  await applyAgentStatusUpdate(event.agentId, {
    status: "idle",
    detailedStatus: null,
    statusMessage: null,
    currentTaskId: null,
    currentTask: null,
    lastHeartbeat: new Date(),
  });
});

on("agent.status_changed", async (event) => {
  // When transitioning to idle, always clear current task so the agent can pick new work.
  // (If the agent omits currentTaskId/currentTask in the payload, we still clear them.)
  const toIdle = event.toStatus === "idle";
  await applyAgentStatusUpdate(event.agentId, {
    status: event.toStatus as "idle" | "active" | "blocked",
    detailedStatus: toIdle ? null : ((event.toDetailedStatus as string) ?? undefined),
    statusMessage: event.statusMessage ?? undefined,
    currentTaskId: toIdle ? null : (event.currentTaskId ?? undefined),
    currentTask: toIdle ? null : (event.currentTask ?? undefined),
    lastHeartbeat: new Date(),
  });
});

on("agent.joined", async (event) => {
  pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: event.agentId });
});
