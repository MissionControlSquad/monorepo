import { prisma } from "@/server/prisma";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, createDMSchema } from "../../_lib/validation";
import { log } from "../../_lib/logger";

export async function GET(request: Request) {
  try {
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    // Find all DM channels the agent is a member of
    const memberships = await prisma.channelMember.findMany({
      where: {
        profileId: agentProfileId,
        channel: { visibility: "dm" },
      },
      include: {
        channel: {
          include: {
            members: {
              include: {
                profile: {
                  select: {
                    id: true,
                    kind: true,
                    displayName: true,
                    username: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                content: true,
                fromProfileId: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    // Build response with unread counts
    const channels = await Promise.all(
      memberships.map(async (membership) => {
        const channel = membership.channel;
        const sinceDate = membership.lastReadAt ?? membership.joinedAt;

        const unreadCount = await prisma.channelMessage.count({
          where: {
            channelId: channel.id,
            createdAt: { gt: sinceDate },
          },
        });

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
    const v = await validateBody(request, createDMSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    const otherProfileId = v.data.profileId;
    if (otherProfileId === agentProfileId) {
      return errorResponse("Cannot start a conversation with yourself", 400);
    }

    // Verify the other profile exists
    const otherProfile = await prisma.profile.findUnique({
      where: { id: otherProfileId },
      select: { id: true, kind: true, displayName: true, username: true, avatarUrl: true },
    });
    if (!otherProfile) {
      return errorResponse("Profile not found", 404);
    }

    // Deterministic slug ensures idempotency (same as GraphQL startConversation)
    const [id1, id2] = [agentProfileId, otherProfileId].sort();
    const slug = `dm-${id1}-${id2}`;

    // Return existing channel if it already exists
    const existing = await prisma.channel.findUnique({
      where: { slug },
      select: { id: true, slug: true, visibility: true },
    });
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
    const channel = await prisma.channel.create({
      data: {
        name: "Direct message",
        slug,
        visibility: "dm",
        projectId: null,
        createdByProfileId: agentProfileId,
        members: {
          create: [
            { profileId: agentProfileId, role: "creator" },
            { profileId: otherProfileId, role: "member" },
          ],
        },
      },
      select: { id: true, slug: true },
    });

    log("dm", `OPENED agent="${agent.name}" → "${otherProfile.displayName}" (new)`, request);
    return successResponse(
      { id: channel.id, slug: channel.slug, otherProfile, created: true },
      201,
    );
  } catch (err) {
    return handleError(err);
  }
}
