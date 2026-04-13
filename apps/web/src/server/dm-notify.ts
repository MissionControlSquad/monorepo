import {
  getChannelVisibility,
  getChannelMessageForNotify,
  getMessageMentionedProfileIds,
  getChannelAgentMembers,
  getChannelHumanMembers,
} from "@agentcenter/database";
import { pubsub, agentStreamTopic } from "./pubsub";
import { ChannelVisibility, NotificationKind } from "./constants";
import { notify } from "./services/notification";
import {
  tryDeliverDmNotification,
  tryDeliverChannelMentionNotification,
} from "./services/live-task-delivery";

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
  const channel = await getChannelVisibility(channelId);
  if (!channel) return;

  const isDm = channel.visibility === ChannelVisibility.DM;

  // Fetch the message with sender profile for the push payload
  const message = await getChannelMessageForNotify(messageId);

  if (!message) return;

  // Mentions (used by both agent and human notification logic)
  const mentionedProfileIds = await getMessageMentionedProfileIds(messageId);
  const mentionedIds = new Set(mentionedProfileIds);

  // ─── Agent notifications ───────────────────────────────────────────
  const agentMembers = await getChannelAgentMembers(channelId, senderProfileId);

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

    // Live gateway: push to connected OpenClaw agents immediately.
    // Fire-and-forget — SSE stream or heartbeat is the fallback for offline agents.
    const agentIdsToNotify = agentsToNotify
      .filter((m) => m.profile.agentId)
      .map((m) => m.profile.agentId as string);

    if (agentIdsToNotify.length > 0) {
      const fromHandle =
        message.fromProfile?.username ?? message.fromProfile?.displayName ?? "unknown";
      const plainContent = message.content.replace(/<[^>]*>/g, "").trim();

      // Skip live push if content stripped to nothing (e.g. attachment-only messages).
      if (!plainContent) return;

      if (isDm) {
        tryDeliverDmNotification(agentIdsToNotify, {
          channelId,
          messageId,
          content: plainContent,
          fromHandle,
        }).catch((err) => console.error("[dm-notify] tryDeliverDmNotification failed:", err));
      } else {
        tryDeliverChannelMentionNotification(agentIdsToNotify, {
          channelId,
          messageId,
          content: plainContent,
          fromHandle,
          channelName: channel.slug ?? undefined,
        }).catch((err) =>
          console.error("[dm-notify] tryDeliverChannelMentionNotification failed:", err),
        );
      }
    }
  }

  // ─── Human push notifications ──────────────────────────────────────
  const humanMembers = await getChannelHumanMembers(channelId, senderProfileId);

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
        type: NotificationKind.NEW_COMMENT,
        title: isDm ? `Message from ${senderName}` : `${senderName} mentioned you`,
        body: message.content.slice(0, 200),
        url: channelUrl,
      }),
    ),
  );
}
