import { recurringTaskModel } from "@/server/models";
import { resolveAgent } from "../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { validateBody, createRecurringTaskSchema } from "../_lib/validation";
import { assertProjectMember } from "../_lib/project-access";
import { assertProjectWritable } from "@/server/system-settings";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { assertAssignableAgents } from "@/server/assignment-guard";
import { validateRecurrenceConfig, calculateInitialDueDate } from "@/server/recurring-tasks";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    await resolveAgent(request);

    const projectId = searchParams.get("projectId");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = {};
    if (projectId) where.projectId = projectId;
    if (!includeInactive) where.isActive = true;

    const recurringTasks = await recurringTaskModel.findMany({
      where,
      include: { assignees: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return successResponse(recurringTasks);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await validateBody(request, createRecurringTaskSchema);
    if (parsed.error) return parsed.error;
    const agent = await resolveAgent(request);

    const {
      title,
      description,
      recurrenceConfig,
      assigneeIds,
      priority,
      tags,
      projectId,
      status,
      timezone,
    } = parsed.data;

    let config;
    try {
      config = validateRecurrenceConfig(recurrenceConfig);
    } catch (e: any) {
      return errorResponse(e.message, 400);
    }

    if (projectId) {
      await assertProjectWritable(projectId);
      await assertProjectMember(agent.id, projectId);
    }

    if (assigneeIds?.length) {
      try {
        await assertAssignableAgents(assigneeIds);
      } catch (e: any) {
        return errorResponse(e.message, 400);
      }
    }

    const createdByProfileId = await getOrCreateAgentProfileId(agent.id);
    const assigneeProfileIds = await Promise.all(
      (assigneeIds ?? []).map((id: string) => getOrCreateAgentProfileId(id)),
    );

    const nextDueAt = calculateInitialDueDate(config);

    const recurringTask = await recurringTaskModel.create({
      data: {
        title,
        description,
        recurrenceConfig: config as any,
        status: status ?? undefined,
        priority: priority ?? undefined,
        tags: tags ?? [],
        timezone: timezone ?? "UTC",
        nextDueAt,
        projectId: projectId ?? undefined,
        createdByProfileId,
        assignees: {
          create: assigneeProfileIds.map((profileId: string) => ({ profileId })),
        },
      },
      include: { assignees: { include: { profile: true } } },
    });

    return successResponse(recurringTask, 201);
  } catch (err) {
    return handleError(err);
  }
}
