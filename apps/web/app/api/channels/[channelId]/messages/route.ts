import { prisma } from "@/server/prisma";
import { pubsub, channelMessageTopic } from "@/server/pubsub";
import { notifyAgentChannelMembers } from "@/server/dm-notify";
import { escapeHtml } from "@/server/sanitize";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";
import { parseMentionIds } from "@/lib/mentions";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { validateBody, createChannelMessageSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { apiLimiters, checkRateLimit } from "../../../_lib/rate-limit-check";

type RouteContext = { params: Promise<{ channelId: string }> };

const PROFILE_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  username: true,
  avatarUrl: true,
} as const;

// ---------- GET — Fetch messages ----------

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const { channelId } = await ctx.params;
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    const membership = await prisma.channelMember.findUnique({
      where: { channelId_profileId: { channelId, profileId: agentProfileId } },
    });
    if (!membership) {
      return errorResponse("Not a member of this channel", 403);
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unreadOnly") !== "false";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);

    const sinceDate = membership.lastReadAt ?? membership.joinedAt;

    const messages = await prisma.channelMessage.findMany({
      where: {
        channelId,
        ...(unreadOnly ? { createdAt: { gt: sinceDate } } : {}),
      },
      include: {
        fromProfile: { select: PROFILE_SELECT },
        mentions: {
          include: {
            profile: {
              select: { id: true, displayName: true, username: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    // Auto-mark read
    const markedReadAt = new Date();
    await prisma.channelMember.update({
      where: { channelId_profileId: { channelId, profileId: agentProfileId } },
      data: { lastReadAt: markedReadAt },
    });

    return successResponse({ messages, markedReadAt: markedReadAt.toISOString() });
  } catch (err) {
    return handleError(err);
  }
}

// ---------- POST — Agent sends a message ----------

export async function POST(request: Request, ctx: RouteContext) {
  if (!(await isFeatureEnabled(FLAG_KEYS.CHANNELS))) {
    return errorResponse("Channels feature is not available on your current plan", 403);
  }
  const limited = await checkRateLimit(apiLimiters.channels, request);
  if (limited) return limited;

  try {
    const { channelId } = await ctx.params;
    const v = await validateBody(request, createChannelMessageSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    const membership = await prisma.channelMember.findUnique({
      where: { channelId_profileId: { channelId, profileId: agentProfileId } },
    });
    if (!membership) {
      return errorResponse("Not a member of this channel", 403);
    }

    const { content: rawContent, attachmentIds } = v.data;
    const content = escapeHtml(rawContent.trim());

    // Parse structured @[id:xxx] mentions
    const mentionedProfileIds = parseMentionIds(content);

    // Get all channel member profile IDs for validation
    const memberProfiles = await prisma.channelMember.findMany({
      where: { channelId },
      select: { profileId: true },
    });
    const validProfileIds = new Set(memberProfiles.map((m) => m.profileId));

    // Filter to only valid, non-self mentions
    const validMentions = mentionedProfileIds.filter(
      (id) => validProfileIds.has(id) && id !== agentProfileId,
    );

    const message = await prisma.channelMessage.create({
      data: {
        channelId,
        fromProfileId: agentProfileId,
        content,
        attachments: {
          create: (attachmentIds ?? []).map((documentId: string) => ({ documentId })),
        },
        mentions: {
          create: validMentions.map((profileId) => ({ profileId })),
        },
      },
      include: {
        fromProfile: { select: PROFILE_SELECT },
        attachments: {
          include: { document: { select: { id: true, title: true, type: true } } },
        },
        mentions: {
          include: {
            profile: {
              select: { id: true, displayName: true, username: true, avatarUrl: true },
            },
          },
        },
      },
    });

    // Publish real-time event — human's GraphQL subscription picks this up
    pubsub.publish(channelMessageTopic(channelId), {
      channelId,
      messageId: message.id,
    });

    // Notify other agent members via their stream (fire-and-forget)
    notifyAgentChannelMembers(channelId, message.id, agentProfileId).catch((err) =>
      console.error("[channel-notify] Failed to notify agent members:", err),
    );

    // Update agent's lastReadAt so own message doesn't show as unread
    await prisma.channelMember.update({
      where: { channelId_profileId: { channelId, profileId: agentProfileId } },
      data: { lastReadAt: new Date() },
    });

    log(
      "channel-msg",
      `SENT agent="${agent.name}" channel=${channelId.slice(0, 8)} mentions=${validMentions.length}`,
      request,
    );
    return successResponse(message, 201);
  } catch (err) {
    return handleError(err);
  }
}
