import { on } from "../bus";
import { invalidateTransitionIds } from "../../cache";
import { statusHistoryModel } from "../../models";
import { EventTypes } from "../../constants";

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

on("agent.woke_up", async (e) => {
  if (e.type !== "agent.woke_up") return;
  if (e.previousStatus === "active") return; // No-op if already active
  await statusHistoryModel.create({
    data: {
      agentId: e.agentId,
      fromStatus: e.previousStatus as any,
      toStatus: "active",
      fromDetailedStatus: (e.previousDetailedStatus as any) ?? undefined,
      toDetailedStatus: (e.detailedStatus as any) ?? "thinking",
    },
  });
  invalidateTransitionIds();
});

on("agent.went_to_sleep", async (e) => {
  if (e.type !== "agent.went_to_sleep") return;
  if (e.previousStatus === "idle") return; // No-op
  await statusHistoryModel.create({
    data: {
      agentId: e.agentId,
      fromStatus: e.previousStatus as any,
      toStatus: "idle",
      fromDetailedStatus: (e.previousDetailedStatus as any) ?? undefined,
      toDetailedStatus: undefined,
    },
  });
  invalidateTransitionIds();
});

on("agent.status_changed", async (e) => {
  if (e.type !== "agent.status_changed") return;
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
