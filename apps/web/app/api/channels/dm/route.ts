import {
  listMemberChannels,
  getChannelUnreadCount,
  findChannelBySlug,
  createDmChannel,
  findProfileForDisplay,
} from "@agentcenter/database";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS, ChannelVisibility } from "@agentcenter/utils";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError, assertFound } from "../../_lib/json-response";
import { ERR } from "../../_lib/error-messages";
import { validateBody, createDMSchema } from "../../_lib/validation";
import { log } from "../../_lib/logger";

export async function GET(request: Request) {
  try {
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    // Find all DM channels the agent is a member of
    const memberships = await listMemberChannels(agentProfileId, ChannelVisibility.DM);

    // Build response with unread counts
    const channels = await Promise.all(
      memberships.map(async (membership) => {
        const channel = membership.channel;

        const unreadCount = await getChannelUnreadCount(channel.id, agentProfileId);

        const otherMember = channel.members.find((m) => m.profileId !== agentProfileId);

        return {
          id: channel.id,
          slug: channel.slug,
          otherProfile: otherMember?.profile ?? null,
          unreadCount,
          lastMessage: channel.messages[0] ?? null,
        };
      }),
    );

    // Sort by latest message descending (channels with no messages last)
    channels.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return successResponse(channels);
  } catch (err) {
    return handleError(err);
  }
}

// ---------- POST — Start a new DM conversation ----------

export async function POST(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.CHANNELS))) {
      return errorResponse("Channels feature is not available on your current plan", 403);
    }
    const v = await validateBody(request, createDMSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    const otherProfileId = v.data.profileId;
    if (otherProfileId === agentProfileId) {
      return errorResponse("Cannot start a conversation with yourself", 400);
    }

    // Verify the other profile exists
    const otherProfile = await findProfileForDisplay(otherProfileId);
    assertFound(otherProfile, ERR.PROFILE_NOT_FOUND);

    // Deterministic slug ensures idempotency (same as GraphQL startConversation)
    const [id1, id2] = [agentProfileId, otherProfileId].sort();
    const slug = `dm-${id1}-${id2}`;

    // Return existing channel if it already exists
    const existing = await findChannelBySlug(slug);
    if (existing) {
      log("dm", `OPENED agent="${agent.name}" → "${otherProfile.displayName}" (existing)`, request);
      return successResponse({
        id: existing.id,
        slug: existing.slug,
        otherProfile,
        created: false,
      });
    }

    // Create new DM channel with both members
    const channel = await createDmChannel(agentProfileId, otherProfileId, slug);

    log("dm", `OPENED agent="${agent.name}" → "${otherProfile.displayName}" (new)`, request);
    return successResponse(
      { id: channel.id, slug: channel.slug, otherProfile, created: true },
      201,
    );
  } catch (err) {
    return handleError(err);
  }
}
