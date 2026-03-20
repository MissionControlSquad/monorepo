import type { Agent } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { emit } from "../events";
import { EventTypes } from "../constants";
import { Model } from "./base";

class AgentModel extends Model<Agent> {
  constructor() {
    super(() => prisma.agent);
  }

  async emitJoined(agent: Pick<Agent, "id" | "name">) {
    await emit({ type: EventTypes.AGENT_JOINED, agentId: agent.id, agentName: agent.name });
  }

  async emitStatusChanged(
    agent: Pick<Agent, "id" | "name" | "status" | "detailedStatus">,
    ctx: {
      toStatus: "idle" | "active" | "blocked";
      toDetailedStatus?: string;
      statusMessage?: string;
      currentTaskId?: string;
      currentTask?: string;
    },
  ) {
    await emit({
      type: EventTypes.AGENT_STATUS_CHANGED,
      agentId: agent.id,
      agentName: agent.name,
      fromStatus: agent.status as "idle" | "active" | "blocked",
      fromDetailedStatus: agent.detailedStatus ?? undefined,
      ...ctx,
    });
  }

  async emitWokeUp(
    agent: Pick<Agent, "id" | "name" | "status" | "detailedStatus">,
    ctx: { currentTaskId?: string; currentTask?: string; detailedStatus?: string },
  ) {
    await emit({
      type: EventTypes.AGENT_WOKE_UP,
      agentId: agent.id,
      agentName: agent.name,
      previousStatus: agent.status as "idle" | "active" | "blocked",
      previousDetailedStatus: agent.detailedStatus ?? undefined,
      ...ctx,
    });
  }

  async emitWentToSleep(agent: Pick<Agent, "id" | "name" | "status" | "detailedStatus">) {
    await emit({
      type: EventTypes.AGENT_WENT_TO_SLEEP,
      agentId: agent.id,
      agentName: agent.name,
      previousStatus: agent.status as "idle" | "active" | "blocked",
      previousDetailedStatus: agent.detailedStatus ?? undefined,
    });
  }
}

export const agentModel = new AgentModel();
