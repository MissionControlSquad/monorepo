import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import {
  FLAG_KEYS,
  ChannelVisibility,
  ChannelMemberRole,
  MessageReactionEmoji,
} from "@agentcenter/utils";
import type { ChannelVisibilityValue } from "@agentcenter/utils";
import {
  createChannelActivityMessage,
  createTeamChannel,
  findChannelBySlugNullable,
  createDmChannelFull,
  getChannelVisibilityOrThrow,
  findChannelMemberRecord,
  findChannelMemberRole,
  createChannelMember,
  deleteChannelMember,
  markChannelMemberRead,
  createChannelMessageFull,
  getChannelMessageOrThrow,
  getChannelMessagePinStatus,
  findChannelMessageReaction,
  deleteChannelMessageReaction,
  createChannelMessageReaction,
  getChannelMessageWithQuery,
  updateChannelMessageContent,
  deleteChannelMessage,
  pinChannelMessage,
  unpinChannelMessage,
  findChannelById,
  deleteChannel,
  getAllProfilesForMentions,
} from "@agentcenter/database";
import { pubsub, channelMessageTopic, channelReactionTopic } from "../../pubsub";
import { assertProjectWritable } from "../../system-settings";
import { notifyAgentChannelMembers } from "../../dm-notify";
import { parseMentionIds } from "@agentcenter/utils";

const CHANNEL_VISIBILITY_VALUES = Object.values(ChannelVisibility);
const CHANNEL_MESSAGE_REACTION_EMOJIS = Object.values(MessageReactionEmoji) as string[];

builder.mutationField("createChannel", (t) =>
  t.prismaField({
    type: "Channel",
    args: {
      name: t.arg.string({ required: true }),
      slug: t.arg.string({ required: true }),
      visibility: t.arg.string({ required: true }),
      description: t.arg.string(),
      createdByProfileId: t.arg.string({ required: true }),
      projectId: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const visibility = args.visibility as ChannelVisibilityValue;
      if (!CHANNEL_VISIBILITY_VALUES.includes(visibility)) {
        throw new Error(`visibility must be one of: ${CHANNEL_VISIBILITY_VALUES.join(", ")}`);
      }
      if (visibility === ChannelVisibility.DM) {
        throw new Error("Use startConversation to create a DM.");
      }
      const slug = args.slug.trim().toLowerCase().replace(/\s+/g, "-");
      if (!slug) throw new Error("slug is required");

      if (args.projectId) await assertProjectWritable(args.projectId);

      return createTeamChannel(
        {
          name: args.name,
          slug,
          visibility,
          description: args.description ?? undefined,
          projectId: args.projectId ?? undefined,
          createdByProfileId: args.createdByProfileId,
        },
        query,
      );
    },
  }),
);

/** Get or create a 1:1 DM channel between two profiles. */
builder.mutationField("startConversation", (t) =>
  t.prismaField({
    type: "Channel",
    args: {
      myProfileId: t.arg.string({ required: true }),
      otherProfileId: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      if (args.myProfileId === args.otherProfileId) {
        throw new Error("Cannot start a conversation with yourself.");
      }
      const [id1, id2] = [args.myProfileId, args.otherProfileId].sort();
      const slug = `dm-${id1}-${id2}`;

      const existing = await findChannelBySlugNullable(slug, query);
      if (existing) {
        if (existing.visibility === ChannelVisibility.DM) return existing;
        throw new Error("A channel already exists for this conversation.");
      }

      return createDmChannelFull(
        {
          slug,
          createdByProfileId: args.myProfileId,
          otherProfileId: args.otherProfileId,
        },
        query,
      );
    },
  }),
);

builder.mutationField("joinChannel", (t) =>
  t.prismaField({
    type: "ChannelMember",
    args: {
      channelId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const channel = await getChannelVisibilityOrThrow(args.channelId);
      if (channel.visibility === ChannelVisibility.DM) {
        throw new Error(
          "Direct messages cannot be joined. Start a conversation with that person instead.",
        );
      }
      if (channel.visibility !== ChannelVisibility.PUBLIC) {
        throw new Error(
          "Only public channels can be joined directly. Ask the channel creator to add you.",
        );
      }
      const existing = await findChannelMemberRecord(args.channelId, args.profileId);
      if (existing) return existing;

      const member = await createChannelMember(
        args.channelId,
        args.profileId,
        ChannelMemberRole.MEMBER,
        query,
      );
      const msg = await createChannelActivityMessage(
        args.channelId,
        args.profileId,
        "Joined the channel.",
      );
      pubsub.publish(channelMessageTopic(args.channelId), {
        channelId: args.channelId,
        messageId: msg.id,
      });
      return member;
    },
  }),
);

builder.mutationField("addChannelMember", (t) =>
  t.prismaField({
    type: "ChannelMember",
    args: {
      channelId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
      addedByProfileId: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const channel = await getChannelVisibilityOrThrow(args.channelId);
      if (channel.visibility !== ChannelVisibility.PRIVATE) {
        throw new Error(
          "addChannelMember is only for private channels. Use joinChannel for public channels.",
        );
      }
      if (args.addedByProfileId !== channel.createdByProfileId) {
        throw new Error("Only the channel creator can add members.");
      }
      const existing = await findChannelMemberRecord(args.channelId, args.profileId);
      if (existing) return existing;

      const member = await createChannelMember(
        args.channelId,
        args.profileId,
        ChannelMemberRole.MEMBER,
        query,
      );
      const msg = await createChannelActivityMessage(
        args.channelId,
        args.addedByProfileId,
        `Added @[id:${args.profileId}] to the channel.`,
        [args.profileId],
      );
      pubsub.publish(channelMessageTopic(args.channelId), {
        channelId: args.channelId,
        messageId: msg.id,
      });
      return member;
    },
  }),
);

builder.mutationField("removeChannelMember", (t) =>
  t.field({
    type: "Boolean",
    args: {
      channelId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
      removedByProfileId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const channel = await getChannelVisibilityOrThrow(args.channelId);
      if (channel.visibility === ChannelVisibility.DM) {
        throw new Error(
          "Cannot remove participants from a direct message. They can leave the conversation.",
        );
      }
      if (channel.visibility !== ChannelVisibility.PRIVATE) {
        throw new Error("removeChannelMember is only for private channels.");
      }
      if (args.removedByProfileId !== channel.createdByProfileId) {
        throw new Error("Only the channel creator can remove members.");
      }
      const member = await findChannelMemberRole(args.channelId, args.profileId);
      if (!member) return true;
      if (member.role === ChannelMemberRole.CREATOR) {
        throw new Error("Cannot remove the channel creator.");
      }
      await deleteChannelMember(args.channelId, args.profileId);
      const msg = await createChannelActivityMessage(
        args.channelId,
        args.removedByProfileId,
        `Removed @[id:${args.profileId}] from the channel.`,
        [args.profileId],
      );
      pubsub.publish(channelMessageTopic(args.channelId), {
        channelId: args.channelId,
        messageId: msg.id,
      });
      return true;
    },
  }),
);

builder.mutationField("leaveChannel", (t) =>
  t.field({
    type: "Boolean",
    args: {
      channelId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const member = await findChannelMemberRole(args.channelId, args.profileId);
      if (!member) return true;
      if (member.role === ChannelMemberRole.CREATOR) {
        throw new Error(
          "Channel creator cannot leave. Transfer ownership or delete the channel first.",
        );
      }
      const msg = await createChannelActivityMessage(
        args.channelId,
        args.profileId,
        "Left the channel.",
      );
      pubsub.publish(channelMessageTopic(args.channelId), {
        channelId: args.channelId,
        messageId: msg.id,
      });
      await deleteChannelMember(args.channelId, args.profileId);
      return true;
    },
  }),
);

builder.mutationField("markChannelRead", (t) =>
  t.field({
    type: "Boolean",
    args: {
      channelId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      await markChannelMemberRead(args.channelId, args.profileId);
      return true;
    },
  }),
);

/** Returns list of profile IDs to create mentions for (@[id:xxx] + @handle + @all). */
function parseMentionedProfileIds(
  content: string,
  fromProfileId: string,
  profiles: { id: string; username: string | null; displayName: string }[],
  validProfileIds: Set<string>,
): string[] {
  const mentionedIds: string[] = [];
  for (const id of parseMentionIds(content)) {
    if (validProfileIds.has(id) && id !== fromProfileId && !mentionedIds.includes(id)) {
      mentionedIds.push(id);
    }
  }
  const wordRegex = /@(\w+)/g;
  let match;
  while ((match = wordRegex.exec(content)) !== null) {
    const word = match[1].toLowerCase();
    if (word === "all") {
      for (const p of profiles) {
        if (p.id !== fromProfileId && !mentionedIds.includes(p.id)) mentionedIds.push(p.id);
      }
      continue;
    }
    const byUsername = profiles.find((p) => p.username?.toLowerCase() === word);
    if (byUsername && byUsername.id !== fromProfileId && !mentionedIds.includes(byUsername.id)) {
      mentionedIds.push(byUsername.id);
      continue;
    }
    const byName = profiles.find((p) =>
      p.displayName
        .toLowerCase()
        .split(/\s+/)
        .some((w: string) => w === word),
    );
    if (byName && byName.id !== fromProfileId && !mentionedIds.includes(byName.id)) {
      mentionedIds.push(byName.id);
    }
  }
  return mentionedIds;
}

builder.mutationField("createChannelMessage", (t) =>
  t.prismaField({
    type: "ChannelMessage",
    args: {
      channelId: t.arg.string({ required: true }),
      fromProfileId: t.arg.string({ required: true }),
      content: t.arg.string({ required: true }),
      attachmentIds: t.arg.stringList(),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const membership = await findChannelMemberRecord(args.channelId, args.fromProfileId);
      if (!membership) {
        throw new Error("You must be a member of the channel to post.");
      }

      const profiles = await getAllProfilesForMentions();
      const validProfileIds = new Set<string>(profiles.map((p: { id: string }) => p.id));
      const mentionedProfileIds = parseMentionedProfileIds(
        args.content,
        args.fromProfileId,
        profiles as { id: string; username: string | null; displayName: string }[],
        validProfileIds,
      );

      // Auto-join mentioned profiles on public channels so they can see and reply.
      // Silently adds them as members (no activity message to avoid noise).
      // Must happen before createChannelMessageFull so notifyAgentChannelMembers
      // picks them up as members when deciding who to notify.
      const channelForMention = await getChannelVisibilityOrThrow(args.channelId);
      if (
        channelForMention.visibility === ChannelVisibility.PUBLIC &&
        mentionedProfileIds.length > 0
      ) {
        await Promise.all(
          mentionedProfileIds.map(async (pid) => {
            const existing = await findChannelMemberRecord(args.channelId, pid);
            if (!existing) {
              await createChannelMember(args.channelId, pid, ChannelMemberRole.MEMBER, {});
            }
          }),
        );
      }

      const message = await createChannelMessageFull(
        {
          channelId: args.channelId,
          fromProfileId: args.fromProfileId,
          content: args.content,
          attachmentIds: args.attachmentIds ?? [],
          mentionedProfileIds,
        },
        query,
      );

      pubsub.publish(channelMessageTopic(args.channelId), {
        channelId: args.channelId,
        messageId: message.id,
      });

      // Notify agent members via their stream (fire-and-forget)
      notifyAgentChannelMembers(args.channelId, message.id, args.fromProfileId).catch((err) =>
        console.error("[channel-notify] Failed to notify agent members:", err),
      );

      return message;
    },
  }),
);

builder.mutationField("toggleChannelMessageReaction", (t) =>
  t.prismaField({
    type: "ChannelMessage",
    args: {
      messageId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
      emoji: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      if (!CHANNEL_MESSAGE_REACTION_EMOJIS.includes(args.emoji as any)) {
        throw new Error(`Invalid emoji. Valid: ${CHANNEL_MESSAGE_REACTION_EMOJIS.join(", ")}`);
      }
      const message = await getChannelMessageOrThrow(args.messageId);

      const existing = await findChannelMessageReaction(args.messageId, args.profileId, args.emoji);

      if (existing) {
        await deleteChannelMessageReaction(existing.id);
      } else {
        await createChannelMessageReaction(args.messageId, args.profileId, args.emoji);
      }

      const updated = await getChannelMessageWithQuery(args.messageId, query);
      pubsub.publish(channelReactionTopic(message.channelId), {
        channelId: message.channelId,
        messageId: args.messageId,
      });
      return updated;
    },
  }),
);

builder.mutationField("updateChannelMessage", (t) =>
  t.prismaField({
    type: "ChannelMessage",
    args: {
      messageId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
      content: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const message = await getChannelMessageOrThrow(args.messageId);
      if (message.fromProfileId !== args.profileId) {
        throw new Error("Only the message author can edit this message.");
      }
      const profiles = await getAllProfilesForMentions();
      const validProfileIds = new Set<string>(profiles.map((p: { id: string }) => p.id));
      const mentionedProfileIds = parseMentionedProfileIds(
        args.content,
        args.profileId,
        profiles as { id: string; username: string | null; displayName: string }[],
        validProfileIds,
      );
      const updated = await updateChannelMessageContent(
        args.messageId,
        args.content,
        mentionedProfileIds,
        query,
      );
      pubsub.publish(channelMessageTopic(message.channelId), {
        channelId: message.channelId,
        messageId: updated.id,
      });
      return updated;
    },
  }),
);

builder.mutationField("deleteChannelMessage", (t) =>
  t.field({
    type: "Boolean",
    args: {
      messageId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const message = await getChannelMessageOrThrow(args.messageId);
      const membership = await findChannelMemberRole(message.channelId, args.profileId);
      if (!membership) throw new Error("You must be a member of the channel.");
      const isAuthor = message.fromProfileId === args.profileId;
      const isCreator = membership.role === ChannelMemberRole.CREATOR;
      if (!isAuthor && !isCreator) {
        throw new Error("Only the message author or channel creator can delete this message.");
      }
      await deleteChannelMessage(args.messageId);
      return true;
    },
  }),
);

builder.mutationField("pinChannelMessage", (t) =>
  t.prismaField({
    type: "ChannelMessage",
    args: {
      messageId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const message = await getChannelMessagePinStatus(args.messageId);
      const membership = await findChannelMemberRecord(message.channelId, args.profileId);
      if (!membership) throw new Error("You must be a member of the channel to pin messages.");
      if (message.pinnedAt) throw new Error("This message is already pinned.");
      return pinChannelMessage(args.messageId, args.profileId, query);
    },
  }),
);

builder.mutationField("unpinChannelMessage", (t) =>
  t.prismaField({
    type: "ChannelMessage",
    args: {
      messageId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const message = await getChannelMessagePinStatus(args.messageId);
      const membership = await findChannelMemberRecord(message.channelId, args.profileId);
      if (!membership) throw new Error("You must be a member of the channel to unpin messages.");
      if (!message.pinnedAt) throw new Error("This message is not pinned.");
      return unpinChannelMessage(args.messageId, query);
    },
  }),
);

builder.mutationField("deleteChannel", (t) =>
  t.field({
    type: "Boolean",
    args: {
      channelId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.CHANNELS);
      const channel = await findChannelById(args.channelId);
      if (!channel) {
        throw new Error("Channel not found.");
      }
      if (channel.visibility === ChannelVisibility.DM) {
        throw new Error("Direct message conversations cannot be deleted.");
      }
      const member = await findChannelMemberRole(args.channelId, args.profileId);
      if (!member || member.role !== ChannelMemberRole.CREATOR) {
        throw new Error("Only the channel creator can delete the channel.");
      }
      await deleteChannel(args.channelId);
      return true;
    },
  }),
);
