export const dynamic = "force-dynamic";

import { taskModel } from "@/server/models/task";
import { TaskStatus } from "@/server/constants";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, handleError } from "../../_lib/json-response";
import { assertProjectMember, getAgentProjectIds, isSquadLead } from "../../_lib/project-access";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";

const STATUS_COLUMNS = [
  TaskStatus.INBOX,
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVIEW,
  TaskStatus.BLOCKED,
  TaskStatus.DONE,
  TaskStatus.CANCELLED,
] as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = await resolveAgent(request);
    const projectId = searchParams.get("projectId");

    const isLead = isSquadLead(agent);

    const where: Record<string, unknown> = {};
    if (projectId) {
      await assertProjectMember(agent.id, projectId);
      where.projectId = projectId;
    } else {
      // Auto-scope to agent's projects + unscoped
      const agentProjectIds = await getAgentProjectIds(agent.id);
      where.OR = [{ projectId: { in: agentProjectIds } }, { projectId: null }];
    }
    if (!isLead) {
      const profileId = await getOrCreateAgentProfileId(agent.id);
      where.assignees = { some: { profileId } };
    }

    const tasks = await taskModel.findMany({
      where,
      include: { assignees: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const board: Record<string, typeof tasks> = {};
    for (const col of STATUS_COLUMNS) {
      board[col] = [];
    }
    for (const task of tasks) {
      if (board[task.status]) {
        board[task.status].push(task);
      }
    }

    return successResponse(board);
  } catch (err) {
    return handleError(err);
  }
}
