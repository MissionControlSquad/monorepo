import { recurringTaskModel } from "@/server/models";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { assertProjectMember } from "../../../_lib/project-access";
import type { RouteContext } from "../../../_lib/route-context";

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    const existing = await recurringTaskModel.findById(id);
    if (!existing) return errorResponse(ERR.RECURRING_TASK_NOT_FOUND, 404);
    if (existing.projectId) await assertProjectMember(agent.id, existing.projectId);

    const updated = await recurringTaskModel.resume(id);
    return successResponse(updated);
  } catch (err) {
    return handleError(err);
  }
}
