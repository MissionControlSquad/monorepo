import { projectMemberModel } from "@/server/models";
import { memberCache, projectIdsCache } from "@/server/cache";
import { Roles, ProjectStatus, ProjectMemberStatus } from "@/server/constants";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";

/**
 * Throws { error, status: 403 } if agent is not an ACTIVE member of projectId.
 */
export async function assertProjectMember(agentId: string, projectId: string) {
  const cacheKey = `${projectId}:${agentId}`;
  const cached = memberCache.get(cacheKey);
  if (cached === true) return;
  if (cached === false) {
    throw {
      error: "You are not an active member of this project",
      status: 403,
    };
  }

  const profileId = await getOrCreateAgentProfileId(agentId);
  const member = await projectMemberModel.findOne({
    where: { projectId, profileId },
    select: { status: true },
  });

  const isActive = member?.status === ProjectMemberStatus.ACTIVE;
  memberCache.set(cacheKey, isActive);

  if (!isActive) {
    throw {
      error: "You are not an active member of this project",
      status: 403,
    };
  }
}

/**
 * Throws 403 if agent is not a Squad Lead AND an active member of projectId.
 */
export async function assertProjectLead(agent: { id: string; role: string }, projectId: string) {
  if (agent.role !== Roles.SQUAD_LEAD) {
    throw {
      error: "Only Squad Lead can perform this action",
      status: 403,
    };
  }
  await assertProjectMember(agent.id, projectId);
}

/**
 * Validates every agentId is an ACTIVE member of projectId.
 * Throws 400 listing which agents aren't active members.
 */
export async function assertAllMembersOfProject(agentIds: string[], projectId: string) {
  if (agentIds.length === 0) return;

  // Resolve all agentIds to profileIds
  const profileIds = await Promise.all(agentIds.map((id) => getOrCreateAgentProfileId(id)));

  const activeMembers = await projectMemberModel.findMany({
    where: { projectId, profileId: { in: profileIds }, status: ProjectMemberStatus.ACTIVE },
    select: { profileId: true },
  });

  const activeMemberProfileIds = new Set(activeMembers.map((m) => m.profileId));
  const nonMembers = agentIds.filter((_, i) => !activeMemberProfileIds.has(profileIds[i]));

  if (nonMembers.length > 0) {
    throw {
      error: `These agents are not active members of the project: ${nonMembers.join(", ")}`,
      status: 400,
    };
  }
}

/**
 * Returns all projectIds where agent is an active member.
 */
export async function getAgentProjectIds(agentId: string): Promise<string[]> {
  let ids = projectIdsCache.get(agentId);
  if (ids) return ids;

  const profileId = await getOrCreateAgentProfileId(agentId);
  const memberships = await projectMemberModel.findMany({
    where: {
      profileId,
      status: ProjectMemberStatus.ACTIVE,
      project: { shutdownActive: false, status: ProjectStatus.ACTIVE },
    },
    select: { projectId: true },
  });
  ids = memberships.map((m) => m.projectId);
  projectIdsCache.set(agentId, ids);
  return ids;
}
