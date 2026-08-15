import { recurringTaskModel } from "@/server/models";
import { withAgent } from "../../_lib/with-agent";
import { successResponse, errorResponse, assertFound } from "../../_lib/json-response";
import { ERR } from "../../_lib/error-messages";
import { validateBody, updateRecurringTaskSchema } from "../../_lib/validation";
import { assertProjectMember } from "../../_lib/project-access";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { assertAssignableAgents } from "@/server/assignment-guard";
import { validateRecurrenceConfig, calculateInitialDueDate } from "@/server/recurring-tasks";
import type { RouteContext } from "../../_lib/route-context";

export const GET = withAgent(async (_request, _agent, ctx: RouteContext) => {
  const { id } = await ctx.params;

  const rt = await recurringTaskModel.findById(id, {
    include: {
      assignees: { include: { profile: true } },
      generatedTasks: { take: 10, orderBy: { createdAt: "desc" } },
    },
  });

  assertFound(rt, ERR.RECURRING_TASK_NOT_FOUND);
  return successResponse(rt);
});

export const PATCH = withAgent(async (request, agent, ctx: RouteContext) => {
  const v = await validateBody(request, updateRecurringTaskSchema);
  if (v.error) return v.error;
  const body = v.data;
  const { id } = await ctx.params;

  const existing = await recurringTaskModel.findById(id);
  assertFound(existing, ERR.RECURRING_TASK_NOT_FOUND);
  if (existing.projectId) await assertProjectMember(agent.id, existing.projectId);

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) data.status = body.status;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.tags !== undefined) data.tags = body.tags;
  if (body.timezone !== undefined) data.timezone = body.timezone;
  if (body.projectId !== undefined) data.projectId = body.projectId;

  if (body.recurrenceConfig !== undefined) {
    try {
      const config = validateRecurrenceConfig(body.recurrenceConfig);
      data.recurrenceConfig = config as any;
      data.nextDueAt = calculateInitialDueDate(config);
    } catch (e: any) {
      return errorResponse(e.message, 400);
    }
  }

  await recurringTaskModel.update(id, { data });

  // Handle assignee changes
  if (body.assigneeIds) {
    try {
      await assertAssignableAgents(body.assigneeIds);
    } catch (e: any) {
      return errorResponse(e.message, 400);
    }
    const profileIds = await Promise.all(
      (body.assigneeIds as string[]).map((aid: string) => getOrCreateAgentProfileId(aid)),
    );
    await recurringTaskModel.setAssignees(id, profileIds);
  }

  // Re-fetch with relations
  const result = await recurringTaskModel.findById(id, {
    include: { assignees: { include: { profile: true } } },
  });
  return successResponse(result);
});

export const DELETE = withAgent(async (_request, agent, ctx: RouteContext) => {
  const { id } = await ctx.params;

  const existing = await recurringTaskModel.findById(id);
  assertFound(existing, ERR.RECURRING_TASK_NOT_FOUND);
  if (existing.projectId) await assertProjectMember(agent.id, existing.projectId);

  await recurringTaskModel.deleteById(id);
  return successResponse({ success: true });
});
