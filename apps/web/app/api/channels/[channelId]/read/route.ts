import { findChannelMember, markChannelRead } from "@agentcenter/database";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { withAgent } from "../../../_lib/with-agent";
import { successResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import type { RouteContext as _RouteContext } from "../../../_lib/route-context";
type RouteContext = _RouteContext<{ channelId: string }>;

/**
 * POST /api/channels/:channelId/read — Mark a channel as read without fetching messages.
 * Use this when you've scanned a channel and decided you don't need to reply.
 */
export const POST = withAgent(async (_request, agent, ctx: RouteContext) => {
  const { channelId } = await ctx.params;
  const agentProfileId = await getOrCreateAgentProfileId(agent.id);

  const membership = await findChannelMember(channelId, agentProfileId);
  assertFound(membership, ERR.NOT_CHANNEL_MEMBER, 403);

  const markedReadAt = new Date();
  await markChannelRead(channelId, agentProfileId, markedReadAt);

  return successResponse({ markedReadAt: markedReadAt.toISOString() });
});
