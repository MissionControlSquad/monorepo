import { prisma } from "@agentcenter/database";
import { pubsub, agentStreamTopic } from "./pubsub";
import { notify } from "./services/notification";

/**
 * After a channel message is created, notify relevant agent members
 * via their per-agent pubsub topic. Skips the sender (no self-notification).
 *
 * Notification rules (smart filtering):
 * - **DM channels**: always notify (it's a direct conversation)
 * - **Team channels**: only notify agents who are @mentioned (or @all)
 * - This prevents agents from being bombarded with irrelevant chatter
 */
export async function notifyAgentChannelMembers(
  channelId: string,
  messageId: string,
  senderProfileId: string,
) {
  // Fetch channel with slug and visibility
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { visibility: true, slug: true },
  });
  if (!channel) return;

  const isDm = channel.visibility === "dm";

  // Fetch the message with sender profile for the push payload
  const message = await prisma.channelMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      channelId: true,
      content: true,
      fromProfileId: true,
      createdAt: true,
      fromProfile: {
        select: {
          id: true,
          kind: true,
          displayName: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!message) return;

  // Mentions (used by both agent and human notification logic)
  const mentions = await prisma.channelMessageMention.findMany({
    where: { messageId },
    select: { profileId: true },
  });
  const mentionedIds = new Set(mentions.map((m) => m.profileId));

  // ─── Agent notifications ───────────────────────────────────────────
  const agentMembers = await prisma.channelMember.findMany({
    where: {
      channelId,
      profileId: { not: senderProfileId },
      profile: { kind: "agent" },
    },
    select: { profileId: true },
  });

  if (agentMembers.length > 0) {
    const agentsToNotify = isDm
      ? agentMembers
      : agentMembers.filter((m) => mentionedIds.has(m.profileId));

    for (const member of agentsToNotify) {
      pubsub.publish(agentStreamTopic(member.profileId), {
        channelId: message.channelId,
        messageId: message.id,
        content: message.content,
        fromProfile: message.fromProfile,
        createdAt: message.createdAt,
      });
    }
  }

  // ─── Human push notifications ──────────────────────────────────────
  const humanMembers = await prisma.channelMember.findMany({
    where: {
      channelId,
      profileId: { not: senderProfileId },
      profile: { kind: "human" },
    },
    select: {
      profileId: true,
      profile: { select: { userId: true } },
    },
  });

  const humanUserIds = (
    isDm ? humanMembers : humanMembers.filter((m) => mentionedIds.has(m.profileId))
  )
    .filter((m) => m.profile.userId)
    .map((m) => m.profile.userId!);

  const senderName = message.fromProfile?.displayName ?? "Someone";
  const channelUrl = `/channels/${channel.slug}`;

  await Promise.allSettled(
    humanUserIds.map((userId) =>
      notify({
        userId,
        type: "new_comment",
        title: isDm ? `Message from ${senderName}` : `${senderName} mentioned you`,
        body: message.content.slice(0, 200),
        url: channelUrl,
      }),
    ),
  );
}
