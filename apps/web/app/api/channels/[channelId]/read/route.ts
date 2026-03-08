import { prisma } from "@/server/prisma";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";

type RouteContext = { params: Promise<{ channelId: string }> };

/**
 * POST /api/channels/:channelId/read — Mark a channel as read without fetching messages.
 * Use this when you've scanned a channel and decided you don't need to reply.
 */
export async function POST(request: Request, ctx: RouteContext) {
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

    const markedReadAt = new Date();
    await prisma.channelMember.update({
      where: { channelId_profileId: { channelId, profileId: agentProfileId } },
      data: { lastReadAt: markedReadAt },
    });

    return successResponse({ markedReadAt: markedReadAt.toISOString() });
  } catch (err) {
    return handleError(err);
  }
}
