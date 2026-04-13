import { on } from "../bus";
import { invalidateTransitionIds } from "../../cache";
import { statusHistoryModel } from "../../models";
import { EventTypes, AgentStatus } from "../../constants";

/** Direct status updates (cron auto-sleep, deactivate, etc.) — same row shape as agent.status_changed */
on(EventTypes.AGENT_STATUS_APPLIED, async (e) => {
  if (e.type !== EventTypes.AGENT_STATUS_APPLIED) return;
  await statusHistoryModel.create({
    data: {
      agentId: e.agentId,
      fromStatus: e.fromStatus as any,
      toStatus: e.toStatus as any,
      fromDetailedStatus: (e.fromDetailedStatus as any) ?? undefined,
      toDetailedStatus: (e.toDetailedStatus as any) ?? undefined,
      statusMessage: e.statusMessage,
    },
  });
  invalidateTransitionIds();
});

on(EventTypes.AGENT_WOKE_UP, async (e) => {
  if (e.type !== EventTypes.AGENT_WOKE_UP) return;
  if (e.previousStatus === AgentStatus.ACTIVE) return; // No-op if already active
  await statusHistoryModel.create({
    data: {
      agentId: e.agentId,
      fromStatus: e.previousStatus as any,
      toStatus: AgentStatus.ACTIVE,
      fromDetailedStatus: (e.previousDetailedStatus as any) ?? undefined,
      toDetailedStatus: (e.detailedStatus as any) ?? "thinking",
    },
  });
  invalidateTransitionIds();
});

on(EventTypes.AGENT_WENT_TO_SLEEP, async (e) => {
  if (e.type !== EventTypes.AGENT_WENT_TO_SLEEP) return;
  if (e.previousStatus === AgentStatus.IDLE) return; // No-op
  await statusHistoryModel.create({
    data: {
      agentId: e.agentId,
      fromStatus: e.previousStatus as any,
      toStatus: AgentStatus.IDLE,
      fromDetailedStatus: (e.previousDetailedStatus as any) ?? undefined,
      toDetailedStatus: undefined,
    },
  });
  invalidateTransitionIds();
});

on(EventTypes.AGENT_STATUS_CHANGED, async (e) => {
  if (e.type !== EventTypes.AGENT_STATUS_CHANGED) return;
  await statusHistoryModel.create({
    data: {
      agentId: e.agentId,
      fromStatus: e.fromStatus as any,
      toStatus: e.toStatus as any,
      fromDetailedStatus: (e.fromDetailedStatus as any) ?? undefined,
      toDetailedStatus: (e.toDetailedStatus as any) ?? undefined,
      statusMessage: e.statusMessage,
    },
  });
  invalidateTransitionIds();
});
