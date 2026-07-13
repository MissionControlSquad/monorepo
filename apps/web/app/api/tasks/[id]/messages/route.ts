import { taskModel } from "@/server/models/task";
import { messageModel, agentModel } from "@/server/models";
import { getProfileAgentId, getProfileIdsByAgentIds } from "@agentcenter/database";
import { pubsub, messageTopic } from "@/server/pubsub";
import { agentListCache } from "@/server/cache";
import { escapeHtml } from "@/server/sanitize";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { parseMentions } from "@agentcenter/utils";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { requireAgentCapability } from "@/server/services/agent-authz";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import { successResponse, handleError, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, createMessageSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { tryMentionAutoAssign } from "@/server/services/mention-auto-assign";
import type { RouteContext } from "../../../_lib/route-context";

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const { id: taskId } = await ctx.params;
    await resolveAgent(request);

    const messages = await messageModel.findMany({
      where: { taskId },
      include: {
        fromProfile: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        mentions: {
          include: { profile: { select: { id: true, displayName: true, username: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return successResponse(messages);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const { id: taskId } = await ctx.params;
    const v = await validateBody(request, createMessageSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);
    await requireAgentCapability(agent, AGENT_CAPABILITY.MESSAGES_SEND);

    const { content: rawContent, attachmentIds } = v.data;
    const content = escapeHtml(rawContent);

    // Resolve or create agent's profile
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    // Parse @mentions from content — resolve to agentIds for notifications
    let agents = agentListCache.get("all") ?? [];
    if (agents.length === 0) {
      agents = await agentModel.findMany({
        select: { id: true, name: true, username: true },
      });
      agentListCache.set("all", agents);
    }

    const mentionedAgentIds: string[] = [];

    // First pass: structured mentions — @[id:profileId] and @[agent:agentId]
    for (const m of parseMentions(content)) {
      if (m.type === "agent") {
        // @[agent:agentId] — use directly
        if (m.id !== agent.id && !mentionedAgentIds.includes(m.id)) {
          const valid = agents.some((a) => a.id === m.id);
          if (valid) mentionedAgentIds.push(m.id);
        }
      } else if (m.type === "id") {
        // @[id:profileId] — resolve profileId → agentId
        const agentId = await getProfileAgentId(m.id);
        if (agentId && agentId !== agent.id && !mentionedAgentIds.includes(agentId)) {
          mentionedAgentIds.push(agentId);
        }
      }
      // task/project mentions need no server-side handling — stored as-is
    }

    // Second pass: @username / @all mentions (backward compat)
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const word = match[1].toLowerCase();

      if (word === "all") {
        for (const a of agents) {
          if (a.id !== agent.id && !mentionedAgentIds.includes(a.id)) {
            mentionedAgentIds.push(a.id);
          }
        }
        continue;
      }

      const byUsername = agents.find((a) => a.username?.toLowerCase() === word);
      if (byUsername && byUsername.id !== agent.id) {
        if (!mentionedAgentIds.includes(byUsername.id)) {
          mentionedAgentIds.push(byUsername.id);
        }
        continue;
      }

      const byName = agents.find((a) =>
        a.name
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w === word),
      );
      if (byName && byName.id !== agent.id) {
        if (!mentionedAgentIds.includes(byName.id)) {
          mentionedAgentIds.push(byName.id);
        }
      }
    }

    // Resolve mentioned agentIds → profileIds for mention records
    const mentionedProfileIds = await getProfileIdsByAgentIds(mentionedAgentIds);

    const task = await taskModel.findByIdSelect(taskId, {
      title: true,
      taskNumber: true,
      projectId: true,
      assignees: { select: { profile: { select: { agentId: true } } } },
    });
    assertFound(task, ERR.TASK_NOT_FOUND);

    const taskAssigneeIds = (task.assignees ?? [])
      .map((a: any) => a.profile?.agentId)
      .filter(Boolean) as string[];

    const message = await messageModel.create({
      data: {
        taskId,
        fromProfileId: agentProfileId,
        content,
        projectId: task?.projectId ?? undefined,
        attachments: {
          create: (attachmentIds ?? []).map((documentId: string) => ({
            documentId,
          })),
        },
        mentions: {
          create: mentionedProfileIds.map((profileId) => ({ profileId })),
        },
      },
      include: {
        fromProfile: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        mentions: {
          include: { profile: { select: { id: true, displayName: true, username: true } } },
        },
      },
    });

    // Auto-assign mentioned agents if sender is a Squad Lead.
    // Must run BEFORE emitCreated so the mention notification handler already
    // sees the correct assignment state when it checks it.
    await tryMentionAutoAssign({ taskId, fromAgentId: agent.id, mentionedAgentIds });

    await messageModel.emitCreated(message, {
      taskNumber: task?.taskNumber,
      taskTitle: task?.title ?? "",
      fromAgentName: agent.name,
      fromProfileId: agentProfileId,
      fromAgentId: agent.id,
      mentionedAgentIds,
      taskAssigneeIds,
    });

    pubsub.publish(messageTopic(taskId), {
      taskId,
      messageId: message.id,
    });
    log(
      "task-msg",
      `SENT agent="${agent.name}" task=#${task.taskNumber} mentions=${mentionedAgentIds.length} attachments=${(attachmentIds ?? []).length}`,
      request,
    );
    return successResponse(message, 201);
  } catch (err) {
    return handleError(err);
  }
}
