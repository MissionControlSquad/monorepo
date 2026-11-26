import { projectModel, agentModel } from "@/server/models";
import { resolveAgent } from "../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { validateBody, createProjectSchema } from "../_lib/validation";
import { parsePaginationParams } from "../_lib/pagination";
import { ProjectStatus, ProjectMemberStatus } from "@/server/constants";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { squadLeadRequired } from "../_lib/project-access";

export async function GET(request: Request) {
  try {
    const agent = await resolveAgent(request);

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
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const v = await validateBody(request, createProjectSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);

    const guard = squadLeadRequired(agent);
    if (guard) return guard;

    const { name, description, memberIds } = v.data;

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

    return successResponse(project, 201);
  } catch (err) {
    return handleError(err);
  }
}
