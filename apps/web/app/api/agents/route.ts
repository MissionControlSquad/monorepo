import { agentModel } from "@/server/models";
import { withAgent } from "../_lib/with-agent";
import { successResponse } from "../_lib/json-response";
import { parsePaginationParams } from "../_lib/pagination";
import { ProjectMemberStatus } from "@/server/constants";

/** Fields safe to expose via the REST API */
const SAFE_AGENT_SELECT = {
  id: true,
  name: true,
  role: true,
  status: true,
  detailedStatus: true,
  statusMessage: true,
  currentTask: true,
  identityEmoji: true,
  level: true,
  username: true,
  lastHeartbeat: true,
  personality: true,
  templateId: true,
} as const;

export const GET = withAgent(async (request, _agent) => {
  const { searchParams } = new URL(request.url);

  const projectId = searchParams.get("projectId");

  const { limit, offset } = parsePaginationParams(searchParams, {
    defaultLimit: 100,
    maxLimit: 500,
  });

  const agents = await agentModel.findMany({
    where: projectId
      ? { projectMemberships: { some: { projectId, status: ProjectMemberStatus.ACTIVE } } }
      : undefined,
    select: SAFE_AGENT_SELECT,
    orderBy: { name: "asc" },
    take: limit,
    skip: offset,
  });
  return successResponse(agents);
});
