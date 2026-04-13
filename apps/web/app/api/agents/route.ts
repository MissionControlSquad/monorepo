import { agentModel } from "@/server/models";
import { resolveAgent } from "../_lib/resolve-agent";
import { successResponse, handleError } from "../_lib/json-response";
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    await resolveAgent(request);

    const projectId = searchParams.get("projectId");

    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

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
  } catch (err) {
    return handleError(err);
  }
}
