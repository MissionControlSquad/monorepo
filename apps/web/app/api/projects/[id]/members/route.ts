import { projectModel, agentModel, projectMemberModel } from "@/server/models";
import { withAgent } from "../../../_lib/with-agent";
import { successResponse, errorResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, projectMemberSchema } from "../../../_lib/validation";
import { assertProjectLead } from "../../../_lib/project-access";
import { Roles, ProjectMemberStatus } from "@/server/constants";
import { invalidateProjectsList } from "@/server/cache";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import type { RouteContext } from "../../../_lib/route-context";

export const POST = withAgent(async (request, agent, context: RouteContext) => {
  const { id: projectId } = await context.params;

  await assertProjectLead(agent, projectId);

  const v = await validateBody(request, projectMemberSchema);
  if (v.error) return v.error;
  const { agentId } = v.data;

  const [project, targetAgent, profileId] = await Promise.all([
    projectModel.findById(projectId, {
      select: { id: true, name: true },
    }),
    agentModel.findById(agentId, {
      select: {
        id: true,
        name: true,
        role: true,
        level: true,
        identityEmoji: true,
        username: true,
        personality: true,
      },
    }),
    getOrCreateAgentProfileId(agentId),
  ]);
  assertFound(project, ERR.PROJECT_NOT_FOUND);
  assertFound(targetAgent, ERR.AGENT_NOT_FOUND);

  const member = await projectMemberModel.upsert({
    where: {
      projectId_profileId: { projectId, profileId },
    },
    create: { projectId, profileId },
    update: { status: ProjectMemberStatus.ACTIVE },
  });

  await projectModel.emitMemberAdded({
    projectId,
    projectName: project.name,
    agentId,
    agentName: targetAgent.name,
    agentRole: targetAgent.role,
    agentLevel: targetAgent.level ?? undefined,
    agentEmoji: targetAgent.identityEmoji ?? undefined,
    agentUsername: targetAgent.username ?? undefined,
    agentPersonality: targetAgent.personality ?? undefined,
  });

  invalidateProjectsList();
  return successResponse(member, 201);
});

export const DELETE = withAgent(async (request, agent, context: RouteContext) => {
  const { id: projectId } = await context.params;

  await assertProjectLead(agent, projectId);

  const v = await validateBody(request, projectMemberSchema);
  if (v.error) return v.error;
  const { agentId } = v.data;

  // Fetch agent and project in parallel
  const [targetAgent, project, profileId] = await Promise.all([
    agentModel.findById(agentId, {
      select: { id: true, name: true, role: true },
    }),
    projectModel.findById(projectId, {
      select: { id: true, name: true },
    }),
    getOrCreateAgentProfileId(agentId),
  ]);
  assertFound(targetAgent, ERR.AGENT_NOT_FOUND);
  if (targetAgent.role === Roles.SQUAD_LEAD) {
    return errorResponse("Cannot remove Squad Lead from a project", 403);
  }
  assertFound(project, ERR.PROJECT_NOT_FOUND);

  // Soft-delete: mark as deactivated instead of deleting
  await projectMemberModel.delegate.update({
    where: {
      projectId_profileId: { projectId, profileId },
    },
    data: { status: ProjectMemberStatus.DEACTIVATED },
  });

  await projectModel.emitMemberRemoved({
    projectId,
    projectName: project.name,
    agentId,
    agentName: targetAgent.name,
  });

  invalidateProjectsList();
  return successResponse({ removed: true });
});
