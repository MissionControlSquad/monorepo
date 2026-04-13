export const dynamic = "force-dynamic";

import { listMemberChannels, getChannelUnreadCount } from "@agentcenter/database";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { resolveAgent } from "../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { ChannelVisibility, type ChannelVisibilityValue } from "@/server/constants";

const VALID_VISIBILITY = new Set<string>(Object.values(ChannelVisibility));

/**
 * GET /api/channels — List all channels the agent is a member of.
 * Returns DMs, public, and private channels with unread counts and last message.
 * Use ?visibility=dm|public|private to filter by type.
 */
export async function GET(request: Request) {
  try {
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    const { searchParams } = new URL(request.url);
    const visibilityParam = searchParams.get("visibility");

    if (visibilityParam && !VALID_VISIBILITY.has(visibilityParam)) {
      return errorResponse("visibility must be one of: public, private, dm", 400);
    }
    const visibility = visibilityParam as ChannelVisibilityValue | null;

    const memberships = await listMemberChannels(agentProfileId, visibility ?? undefined);

    const channels = await Promise.all(
      memberships.map(async (membership) => {
        const channel = membership.channel;

        const unreadCount = await getChannelUnreadCount(channel.id, agentProfileId);

        // For DMs, extract the other person's profile
        const otherProfile =
          channel.visibility === ChannelVisibility.DM
            ? (channel.members.find((m) => m.profileId !== agentProfileId)?.profile ?? null)
            : null;

        return {
          id: channel.id,
          name: channel.name,
          slug: channel.slug,
          visibility: channel.visibility,
          description: channel.description,
          otherProfile, // only set for DMs
          memberCount: channel.members.length,
          unreadCount,
          lastMessage: channel.messages[0] ?? null,
        };
      }),
    );

    // Sort: unread first, then by latest message descending
    channels.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return successResponse(channels);
  } catch (err) {
    return handleError(err);
  }
}
