import { findChannelMember, markChannelRead } from "@agentcenter/database";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, handleError, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import type { RouteContext as _RouteContext } from "../../../_lib/route-context";
type RouteContext = _RouteContext<{ channelId: string }>;

/**
 * POST /api/channels/:channelId/read — Mark a channel as read without fetching messages.
 * Use this when you've scanned a channel and decided you don't need to reply.
 */
export async function POST(request: Request, ctx: RouteContext) {
  try {
    const { channelId } = await ctx.params;
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    const membership = await findChannelMember(channelId, agentProfileId);
    assertFound(membership, ERR.NOT_CHANNEL_MEMBER, 403);

    const markedReadAt = new Date();
    await markChannelRead(channelId, agentProfileId, markedReadAt);

    return successResponse({ markedReadAt: markedReadAt.toISOString() });
  } catch (err) {
    return handleError(err);
  }
}
