import {
  findChannelMember,
  getChannelMessages,
  markChannelRead,
  createChannelMessage,
  getChannelMemberIds,
} from "@agentcenter/database";
import { pubsub, channelMessageTopic } from "@/server/pubsub";
import { notifyAgentChannelMembers } from "@/server/dm-notify";
import { escapeHtml } from "@/server/sanitize";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { FLAG_KEYS, parseMentionIds } from "@agentcenter/utils";
import { withAgent } from "../../../_lib/with-agent";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import { successResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { parsePaginationParams } from "../../../_lib/pagination";
import { validateBody, createChannelMessageSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { apiLimiters, checkRateLimit } from "../../../_lib/rate-limit-check";
import type { RouteContext as _RouteContext } from "../../../_lib/route-context";
type RouteContext = _RouteContext<{ channelId: string }>;

// ---------- GET — Fetch messages ----------

export const GET = withAgent(async (request, agent, ctx: RouteContext) => {
  const { channelId } = await ctx.params;
  const agentProfileId = await getOrCreateAgentProfileId(agent.id);

  const membership = await findChannelMember(channelId, agentProfileId);
  assertFound(membership, ERR.NOT_CHANNEL_MEMBER, 403);

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") !== "false";
  const { limit } = parsePaginationParams(searchParams, { defaultLimit: 50, maxLimit: 200 });

  const sinceDate = membership.lastReadAt ?? membership.joinedAt;

  const messages = await getChannelMessages(channelId, {
    limit,
    since: unreadOnly ? sinceDate : undefined,
  });

  // Auto-mark read
  const markedReadAt = new Date();
  await markChannelRead(channelId, agentProfileId, markedReadAt);

  return successResponse({ messages, markedReadAt: markedReadAt.toISOString() });
});

// ---------- POST — Agent sends a message ----------

export const POST = withAgent(
  async (request, agent, ctx: RouteContext) => {
    const limited = await checkRateLimit(apiLimiters.channels, request);
    if (limited) return limited;

    const { channelId } = await ctx.params;
    const v = await validateBody(request, createChannelMessageSchema);
    if (v.error) return v.error;
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    const membership = await findChannelMember(channelId, agentProfileId);
    assertFound(membership, ERR.NOT_CHANNEL_MEMBER, 403);

    const { content: rawContent, attachmentIds } = v.data;
    const content = escapeHtml(rawContent.trim());

    // Parse structured @[id:xxx] mentions
    const mentionedProfileIds = parseMentionIds(content);

    // Get all channel member profile IDs for validation
    const memberProfileIds = await getChannelMemberIds(channelId);
    const validProfileIds = new Set(memberProfileIds);

    // Filter to only valid, non-self mentions
    const validMentions = mentionedProfileIds.filter(
      (id) => validProfileIds.has(id) && id !== agentProfileId,
    );

    const message = await createChannelMessage({
      channelId,
      fromProfileId: agentProfileId,
      content,
      attachmentDocumentIds: attachmentIds ?? [],
      mentionProfileIds: validMentions,
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
    await markChannelRead(channelId, agentProfileId);

    log(
      "channel-msg",
      `SENT agent="${agent.name}" channel=${channelId.slice(0, 8)} mentions=${validMentions.length}`,
      request,
    );
    return successResponse(message, 201);
  },
  {
    feature: { flag: FLAG_KEYS.CHANNELS, error: ERR.FEATURE_CHANNELS_UNAVAILABLE },
    capability: AGENT_CAPABILITY.CHANNELS_POST,
  },
);
