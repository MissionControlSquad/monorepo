import { agentModel } from "./models";
import { findProfilesWithAgentId, findAgentsUnavailableByIds } from "@agentcenter/database";
import { isSystemShutdown, isProjectShutdown } from "./system-settings";

/**
 * Prisma where-clause that matches agents who CANNOT receive tasks.
 * Single source of truth for "unavailable" — used by both the assertion
 * guard (throw path) and the recurring-task filter (silent-skip path).
 */
export const UNAVAILABLE_AGENT_WHERE = {
  OR: [
    { setupStatus: "pending_setup" as const },
    { setupStatus: "deactivated" as const },
    { isOnVacation: true },
  ],
};

/**
 * Returns a human-readable reason why an agent can't be assigned,
 * or undefined if the agent is assignable.
 */
function unavailableReason(agent: {
  setupStatus: string;
  isOnVacation: boolean;
}): string | undefined {
  if (agent.setupStatus === "deactivated")
    return "Deactivated agents cannot be assigned. Reactivate them first.";
  if (agent.setupStatus === "pending_setup")
    return "Agents with incomplete setup cannot be assigned. Complete setup first.";
  if (agent.isOnVacation) return "Agent is on vacation.";
  return undefined;
}

/**
 * Throws if any of the given agent IDs are unavailable (pending_setup,
 * deactivated, or on vacation). Also blocks all assignments when the
 * system is in shutdown mode.
 *
 * Call this before assigning agents to a task.
 */
export async function assertAssignableAgents(
  agentIds: string[],
  projectId?: string | null,
): Promise<void> {
  if (await isSystemShutdown()) {
    throw new Error("System is in shutdown mode. No new tasks can be assigned.");
  }

  if (projectId && (await isProjectShutdown(projectId))) {
    throw new Error("This project is in shutdown mode. No new tasks can be assigned to it.");
  }

  if (agentIds.length === 0) return;

  const agents = await agentModel.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, setupStatus: true, isOnVacation: true },
  });

  for (const agent of agents) {
    const reason = unavailableReason(agent);
    if (reason) {
      throw new Error(`Cannot assign to: ${agent.name}. ${reason}`);
    }
  }

  const foundIds = new Set(agents.map((a) => a.id));
  const missing = agentIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Agents not found: ${missing.join(", ")}`);
  }
}

/**
 * Given a list of profile-based assignees, silently remove any whose
 * linked agent is unavailable (deactivated, pending setup, or on vacation).
 * Non-agent profiles (humans) always pass through.
 *
 * Use this for recurring-task generation where we still want the task
 * created — just without the unavailable agents.
 */
export async function filterAvailableAssignees(
  assignees: { profileId: string }[],
): Promise<{ profileId: string }[]> {
  if (assignees.length === 0) return assignees;

  const profiles = await findProfilesWithAgentId(assignees.map((a) => a.profileId));

  const agentIds = profiles.map((p) => p.agentId).filter((id): id is string => id != null);

  if (agentIds.length === 0) return assignees;

  const unavailable = await findAgentsUnavailableByIds(agentIds, UNAVAILABLE_AGENT_WHERE);
  const unavailableIds = new Set(unavailable.map((a) => a.id));

  const blockedProfileIds = new Set(
    profiles.filter((p) => p.agentId && unavailableIds.has(p.agentId)).map((p) => p.id),
  );

  return assignees.filter((a) => !blockedProfileIds.has(a.profileId));
}
