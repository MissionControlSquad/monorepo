export const dynamic = "force-dynamic";

import { taskModel } from "@/server/models/task";
import { messageModel, agentModel } from "@/server/models";
import { getProfileIdsByAgentIds } from "@agentcenter/database";
import { pubsub, messageTopic } from "@/server/pubsub";
import { agentListCache } from "@/server/cache";
import { escapeHtml } from "@/server/sanitize";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { resolveAgent } from "../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { validateBody, createMessageSchema } from "../_lib/validation";
import { parsePaginationParams } from "../_lib/pagination";
import { apiLimiters, checkRateLimit } from "../_lib/rate-limit-check";
import { isSystemShutdown } from "@/server/system-settings";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    await resolveAgent(request);

    const taskId = searchParams.get("taskId");
    if (!taskId) return errorResponse("taskId query parameter is required", 400);

    const { limit, offset } = parsePaginationParams(searchParams, {
      defaultLimit: 200,
      maxLimit: 500,
    });

    const messages = await messageModel.findMany({
      where: { taskId },
      include: {
        fromProfile: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        mentions: {
          include: { profile: { select: { id: true, displayName: true, username: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    });

    return successResponse(messages);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  const limited = await checkRateLimit(apiLimiters.messages, request);
  if (limited) return limited;

  try {
    const v = await validateBody(request, createMessageSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);

    if (await isSystemShutdown()) {
      return errorResponse("System is in shutdown mode. No messages can be sent.", 503);
    }

    const { taskId, content: rawContent, attachmentIds } = v.data;
    if (!taskId) {
      return errorResponse("taskId is required", 400);
    }
    const content = escapeHtml(rawContent);

    // Resolve or create agent's profile
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    // Parse @mentions from content
    let agents = agentListCache.get("all");
    if (!agents) {
      agents = await agentModel.findMany({
        select: { id: true, name: true, username: true },
      });
      agentListCache.set("all", agents);
    }

    const mentionedAgentIds: string[] = [];
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
    });

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

    await messageModel.emitCreated(message, {
      taskNumber: task?.taskNumber,
      taskTitle: task?.title ?? "",
      fromAgentName: agent.name,
      fromProfileId: agentProfileId,
      fromAgentId: agent.id,
      mentionedAgentIds,
    });

    pubsub.publish(messageTopic(taskId), { taskId, messageId: message.id });
    return successResponse(message, 201);
  } catch (err) {
    return handleError(err);
  }
}
