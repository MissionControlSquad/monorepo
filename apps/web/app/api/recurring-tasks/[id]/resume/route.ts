import { recurringTaskModel } from "@/server/models";
import { withAgent } from "../../../_lib/with-agent";
import { successResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { assertProjectMember } from "../../../_lib/project-access";
import type { RouteContext } from "../../../_lib/route-context";

export const POST = withAgent(async (_request, agent, ctx: RouteContext) => {
  const { id } = await ctx.params;

  const existing = await recurringTaskModel.findById(id);
  assertFound(existing, ERR.RECURRING_TASK_NOT_FOUND);
  if (existing.projectId) await assertProjectMember(agent.id, existing.projectId);

  const updated = await recurringTaskModel.resume(id);
  return successResponse(updated);
});
