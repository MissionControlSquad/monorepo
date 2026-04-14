/** @agentcenter/database - Project squad lead lookup for live-gateway notifications. */

import { prisma } from "../client";
import { ProfileKind, ProjectMemberStatus, Roles, SetupStatus } from "@agentcenter/utils";

/**
 * Return the agent IDs of all squad lead agents who are active members of a project.
 * Used by inbox and review notifications.
 */
export async function getProjectSquadLeadAgentIds(projectId: string): Promise<string[]> {
  const members = await prisma.projectMember
    .findMany({
      where: { projectId, status: ProjectMemberStatus.ACTIVE },
      select: { profile: { select: { agentId: true, kind: true } } },
    })
    .catch(() => []);

  const projectAgentIds = members
    .filter((m) => m.profile?.kind === ProfileKind.AGENT && m.profile?.agentId)
    .map((m) => m.profile!.agentId as string);

  if (!projectAgentIds.length) return [];

  const squadLeads = await prisma.agent
    .findMany({
      where: { id: { in: projectAgentIds }, role: Roles.SQUAD_LEAD },
      select: { id: true },
    })
    .catch(() => []);

  return squadLeads.map((a) => a.id);
}

/**
 * Return the agent IDs of all active squad lead agents across the whole workspace.
 * Used for workspace-scoped inbox notifications (no project).
 */
export async function getWorkspaceSquadLeadAgentIds(): Promise<string[]> {
  const squadLeads = await prisma.agent
    .findMany({
      where: { setupStatus: SetupStatus.ACTIVE, role: Roles.SQUAD_LEAD },
      select: { id: true },
    })
    .catch(() => []);
  return squadLeads.map((a) => a.id);
}
