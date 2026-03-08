import { recurringTaskModel } from "@/server/models";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { assertProjectMember } from "../../../_lib/project-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    const existing = await recurringTaskModel.findById(id);
    if (!existing) return errorResponse("Recurring task not found", 404);
    if (existing.projectId) await assertProjectMember(agent.id, existing.projectId);

    const updated = await recurringTaskModel.pause(id);
    return successResponse(updated);
  } catch (err) {
    return handleError(err);
  }
}
