import { recurringTaskModel } from "@/server/models";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { assertProjectMember } from "../../_lib/project-access";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { assertAssignableAgents } from "@/server/assignment-guard";
import { validateRecurrenceConfig, calculateInitialDueDate } from "@/server/recurring-tasks";
import type { RouteContext } from "../../_lib/route-context";

export async function GET(request: Request, ctx: RouteContext) {
  try {
    await resolveAgent(request);
    const { id } = await ctx.params;

    const rt = await recurringTaskModel.findById(id, {
      include: {
        assignees: { include: { profile: true } },
        generatedTasks: { take: 10, orderBy: { createdAt: "desc" } },
      },
    });

    if (!rt) return errorResponse("Recurring task not found", 404);
    return successResponse(rt);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const body = await request.json();
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    const existing = await recurringTaskModel.findById(id);
    if (!existing) return errorResponse("Recurring task not found", 404);
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
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    const existing = await recurringTaskModel.findById(id);
    if (!existing) return errorResponse("Recurring task not found", 404);
    if (existing.projectId) await assertProjectMember(agent.id, existing.projectId);

    await recurringTaskModel.deleteById(id);
    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
