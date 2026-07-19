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
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS, parseMentionIds } from "@agentcenter/utils";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { requireAgentCapability } from "@/server/services/agent-authz";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { parsePaginationParams } from "../../../_lib/pagination";
import { validateBody, createChannelMessageSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { apiLimiters, checkRateLimit } from "../../../_lib/rate-limit-check";
import type { RouteContext as _RouteContext } from "../../../_lib/route-context";
type RouteContext = _RouteContext<{ channelId: string }>;

// ---------- GET — Fetch messages ----------

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const { channelId } = await ctx.params;
    const agent = await resolveAgent(request);
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
  } catch (err) {
    return handleError(err);
  }
}

// ---------- POST — Agent sends a message ----------

export async function POST(request: Request, ctx: RouteContext) {
  if (!(await isFeatureEnabled(FLAG_KEYS.CHANNELS))) {
    return errorResponse(ERR.FEATURE_CHANNELS_UNAVAILABLE, 403);
  }
  const limited = await checkRateLimit(apiLimiters.channels, request);
  if (limited) return limited;

  try {
    const { channelId } = await ctx.params;
    const v = await validateBody(request, createChannelMessageSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);
    await requireAgentCapability(agent, AGENT_CAPABILITY.CHANNELS_POST);
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
  } catch (err) {
    return handleError(err);
  }
}
