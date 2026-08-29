import { projectModel, agentModel } from "@/server/models";
import { withAgent } from "../_lib/with-agent";
import { successResponse, errorResponse } from "../_lib/json-response";
import { validateBody, createProjectSchema } from "../_lib/validation";
import { parsePaginationParams } from "../_lib/pagination";
import { ProjectStatus, ProjectMemberStatus } from "@/server/constants";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { squadLeadRequired } from "../_lib/project-access";
import { checkLicenseLimit } from "@/server/license";
import { recordPlanUsageFromRequest } from "@/server/tenancy";
import { USAGE_QUOTA_SLUGS } from "@/lib/quota-slugs";

export const GET = withAgent(async (request, agent) => {
  const { searchParams } = new URL(request.url);
  const { limit, offset } = parsePaginationParams(searchParams, {
    defaultLimit: 100,
    maxLimit: 500,
  });

  const agentProfileId = await getOrCreateAgentProfileId(agent.id);
  const projects = await projectModel.findMany({
    where: {
      status: ProjectStatus.ACTIVE,
      shutdownActive: false,
      members: { some: { profileId: agentProfileId, status: ProjectMemberStatus.ACTIVE } },
    },
    include: {
      members: {
        where: { status: ProjectMemberStatus.ACTIVE },
        include: { profile: true },
      },
    },
    orderBy: { name: "asc" },
    take: limit,
    skip: offset,
  });

  return successResponse(projects);
});

export const POST = withAgent(async (request, agent) => {
  const v = await validateBody(request, createProjectSchema);
  if (v.error) return v.error;

  const guard = squadLeadRequired(agent);
  if (guard) return guard;

  const { name, description, memberIds } = v.data;

  // Enforce license limit on project count
  const projectCount = await projectModel.count({ where: { status: ProjectStatus.ACTIVE } });
  const limitCheck = await checkLicenseLimit("projects", projectCount);
  if (!limitCheck.allowed) {
    return errorResponse(
      `Project limit reached (${limitCheck.limit}). Upgrade your plan to add more projects.`,
      403,
    );
  }

  // Always include the creating Squad Lead
  const allMemberIds = [...new Set([...(memberIds ?? []), agent.id])];

  // Validate all memberIds reference existing agents
  const existingAgents = await agentModel.findMany({
    where: { id: { in: allMemberIds } },
    select: { id: true },
  });
  if (existingAgents.length !== allMemberIds.length) {
    const existingIds = new Set(existingAgents.map((a) => a.id));
    const missing = allMemberIds.filter((id) => !existingIds.has(id));
    return errorResponse(`Agent IDs not found: ${missing.join(", ")}`, 400);
  }

  // Resolve all agent IDs to profile IDs
  const memberProfileIds = await Promise.all(
    allMemberIds.map((id) => getOrCreateAgentProfileId(id)),
  );

  const project = await projectModel.create({
    data: {
      name,
      description: description ?? undefined,
      status: ProjectStatus.ACTIVE,
      members: {
        create: memberProfileIds.map((profileId) => ({ profileId })),
      },
    },
    include: {
      members: {
        include: { profile: true },
      },
    },
  });

  await projectModel.emitCreated(project, {
    memberIds: allMemberIds,
  });

  // Best-effort: record consumption of the workspace's HUMAN plan `projects` quota in buildbase.
  // No-ops for agent-authenticated/CLI callers with no human buildbase session and while buildbase
  // is unconfigured. Fail-safe — never blocks or breaks the create.
  await recordPlanUsageFromRequest(request, { quotaSlug: USAGE_QUOTA_SLUGS.projects });

  return successResponse(project, 201);
});
