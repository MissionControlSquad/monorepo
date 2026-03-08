import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "../../../lib/feature-flag-keys";
import { prisma } from "../../prisma";
import { pubsub, channelMessageTopic, channelReactionTopic } from "../../pubsub";
import { assertProjectWritable } from "../../system-settings";
import { notifyAgentChannelMembers } from "../../dm-notify";
import { parseMentionIds } from "../../../lib/mentions";

const CHANNEL_VISIBILITY = ["public", "private", "dm"] as const;
const CHANNEL_MESSAGE_REACTION_EMOJIS = [
  "thumbs-up",
  "heart",
  "eyes",
  "checkmark",
  "party",
  "think",
] as const;

/** Create a channel activity message (join/add/remove/leave) and publish for real-time.
 * Use @[id:profileId] in content for mentions so they render as clickable profile links.
 * mentionedProfileIds are stored as ChannelMessageMention for consistency. */
async function createChannelActivityMessage(
  channelId: string,
  fromProfileId: string,
  content: string,
  mentionedProfileIds: string[] = [],
): Promise<void> {
  const message = await prisma.channelMessage.create({
    data: {
      channelId,
      fromProfileId,
      content,
      mentions: {
        create: mentionedProfileIds.map((profileId) => ({ profileId })),
      },
    },
  });
  pubsub.publish(channelMessageTopic(channelId), { channelId, messageId: message.id });
}

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
      const visibility = args.visibility as "public" | "private" | "dm";
      if (!CHANNEL_VISIBILITY.includes(visibility)) {
        throw new Error(`visibility must be one of: ${CHANNEL_VISIBILITY.join(", ")}`);
      }
      if (visibility === "dm") {
        throw new Error("Use startConversation to create a DM.");
      }
      const slug = args.slug.trim().toLowerCase().replace(/\s+/g, "-");
      if (!slug) throw new Error("slug is required");

      if (args.projectId) await assertProjectWritable(args.projectId);

      return prisma.channel.create({
        ...query,
        data: {
          name: args.name,
          slug,
          visibility,
          description: args.description ?? undefined,
          projectId: args.projectId ?? undefined,
          createdByProfileId: args.createdByProfileId,
          members: {
            create: {
              profileId: args.createdByProfileId,
              role: "creator",
            },
          },
        },
      });
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

      const existing = await prisma.channel.findUnique({
        ...query,
        where: { slug },
      });
      if (existing) {
        if (existing.visibility === "dm") return existing;
        throw new Error("A channel already exists for this conversation.");
      }

      return prisma.channel.create({
        ...query,
        data: {
          name: "Direct message",
          slug,
          visibility: "dm",
          projectId: null, // DMs are global, not tied to a project
          createdByProfileId: args.myProfileId,
          members: {
            create: [
              { profileId: args.myProfileId, role: "creator" },
              { profileId: args.otherProfileId, role: "member" },
            ],
          },
        },
      });
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
      const channel = await prisma.channel.findUniqueOrThrow({
        where: { id: args.channelId },
        select: { visibility: true },
      });
      if (channel.visibility === "dm") {
        throw new Error(
          "Direct messages cannot be joined. Start a conversation with that person instead.",
        );
      }
      if (channel.visibility !== "public") {
        throw new Error(
          "Only public channels can be joined directly. Ask the channel creator to add you.",
        );
      }
      const existing = await prisma.channelMember.findUnique({
        where: { channelId_profileId: { channelId: args.channelId, profileId: args.profileId } },
      });
      if (existing) return existing;

      const member = await prisma.channelMember.create({
        ...query,
        data: {
          channelId: args.channelId,
          profileId: args.profileId,
          role: "member",
        },
      });
      await createChannelActivityMessage(args.channelId, args.profileId, "Joined the channel.");
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
      const channel = await prisma.channel.findUniqueOrThrow({
        where: { id: args.channelId },
        select: { visibility: true, createdByProfileId: true },
      });
      if (channel.visibility === "dm") {
        throw new Error(
          "Direct messages allow only two participants. You cannot add people to a DM.",
        );
      }
      if (channel.visibility !== "private") {
        throw new Error(
          "addChannelMember is only for private channels. Use joinChannel for public channels.",
        );
      }
      if (args.addedByProfileId !== channel.createdByProfileId) {
        throw new Error("Only the channel creator can add members.");
      }
      const existing = await prisma.channelMember.findUnique({
        where: { channelId_profileId: { channelId: args.channelId, profileId: args.profileId } },
      });
      if (existing) return existing;

      const member = await prisma.channelMember.create({
        ...query,
        data: {
          channelId: args.channelId,
          profileId: args.profileId,
          role: "member",
        },
      });
      await createChannelActivityMessage(
        args.channelId,
        args.addedByProfileId,
        `Added @[id:${args.profileId}] to the channel.`,
        [args.profileId],
      );
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
      const channel = await prisma.channel.findUniqueOrThrow({
        where: { id: args.channelId },
        select: { visibility: true, createdByProfileId: true },
      });
      if (channel.visibility === "dm") {
        throw new Error(
          "Cannot remove participants from a direct message. They can leave the conversation.",
        );
      }
      if (channel.visibility !== "private") {
        throw new Error("removeChannelMember is only for private channels.");
      }
      if (args.removedByProfileId !== channel.createdByProfileId) {
        throw new Error("Only the channel creator can remove members.");
      }
      const member = await prisma.channelMember.findUnique({
        where: { channelId_profileId: { channelId: args.channelId, profileId: args.profileId } },
        select: { role: true },
      });
      if (!member) return true;
      if (member.role === "creator") {
        throw new Error("Cannot remove the channel creator.");
      }
      await prisma.channelMember.delete({
        where: { channelId_profileId: { channelId: args.channelId, profileId: args.profileId } },
      });
      await createChannelActivityMessage(
        args.channelId,
        args.removedByProfileId,
        `Removed @[id:${args.profileId}] from the channel.`,
        [args.profileId],
      );
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
      const member = await prisma.channelMember.findUnique({
        where: { channelId_profileId: { channelId: args.channelId, profileId: args.profileId } },
        select: { role: true },
      });
      if (!member) return true;
      if (member.role === "creator") {
        throw new Error(
          "Channel creator cannot leave. Transfer ownership or delete the channel first.",
        );
      }
      await createChannelActivityMessage(args.channelId, args.profileId, "Left the channel.");
      await prisma.channelMember.delete({
        where: { channelId_profileId: { channelId: args.channelId, profileId: args.profileId } },
      });
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
      await prisma.channelMember.updateMany({
        where: {
          channelId: args.channelId,
          profileId: args.profileId,
        },
        data: { lastReadAt: new Date() },
      });
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
      const membership = await prisma.channelMember.findUnique({
        where: {
          channelId_profileId: { channelId: args.channelId, profileId: args.fromProfileId },
        },
      });
      if (!membership) {
        throw new Error("You must be a member of the channel to post.");
      }

      const profiles = await prisma.profile.findMany({
        select: { id: true, displayName: true, username: true },
      });
      const validProfileIds = new Set<string>(profiles.map((p: { id: string }) => p.id));
      const mentionedProfileIds = parseMentionedProfileIds(
        args.content,
        args.fromProfileId,
        profiles as { id: string; username: string | null; displayName: string }[],
        validProfileIds,
      );

      const message = await prisma.channelMessage.create({
        ...query,
        data: {
          channelId: args.channelId,
          fromProfileId: args.fromProfileId,
          content: args.content,
          attachments: {
            create: (args.attachmentIds ?? []).map((documentId) => ({ documentId })),
          },
          mentions: {
            create: mentionedProfileIds.map((profileId) => ({ profileId })),
          },
        },
      });

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
      const message = await prisma.channelMessage.findUniqueOrThrow({
        where: { id: args.messageId },
        select: { channelId: true },
      });

      const existing = await prisma.channelMessageReaction.findUnique({
        where: {
          messageId_profileId_emoji: {
            messageId: args.messageId,
            profileId: args.profileId,
            emoji: args.emoji,
          },
        },
      });

      if (existing) {
        await prisma.channelMessageReaction.delete({
          where: { id: existing.id },
        });
      } else {
        await prisma.channelMessageReaction.create({
          data: {
            messageId: args.messageId,
            profileId: args.profileId,
            emoji: args.emoji,
          },
        });
      }

      const updated = await prisma.channelMessage.findUniqueOrThrow({
        ...query,
        where: { id: args.messageId },
      });
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
      const message = await prisma.channelMessage.findUniqueOrThrow({
        where: { id: args.messageId },
        select: { id: true, channelId: true, fromProfileId: true },
      });
      if (message.fromProfileId !== args.profileId) {
        throw new Error("Only the message author can edit this message.");
      }
      const profiles = await prisma.profile.findMany({
        select: { id: true, displayName: true, username: true },
      });
      const validProfileIds = new Set<string>(profiles.map((p: { id: string }) => p.id));
      const mentionedProfileIds = parseMentionedProfileIds(
        args.content,
        args.profileId,
        profiles as { id: string; username: string | null; displayName: string }[],
        validProfileIds,
      );
      await prisma.channelMessageMention.deleteMany({ where: { messageId: args.messageId } });
      const updated = await prisma.channelMessage.update({
        ...query,
        where: { id: args.messageId },
        data: {
          content: args.content,
          mentions: {
            create: mentionedProfileIds.map((profileId) => ({ profileId })),
          },
        },
      });
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
      const message = await prisma.channelMessage.findUniqueOrThrow({
        where: { id: args.messageId },
        select: { channelId: true, fromProfileId: true },
      });
      const membership = await prisma.channelMember.findUnique({
        where: {
          channelId_profileId: { channelId: message.channelId, profileId: args.profileId },
        },
        select: { role: true },
      });
      if (!membership) throw new Error("You must be a member of the channel.");
      const isAuthor = message.fromProfileId === args.profileId;
      const isCreator = membership.role === "creator";
      if (!isAuthor && !isCreator) {
        throw new Error("Only the message author or channel creator can delete this message.");
      }
      await prisma.channelMessage.delete({ where: { id: args.messageId } });
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
      const message = await prisma.channelMessage.findUniqueOrThrow({
        where: { id: args.messageId },
        select: { channelId: true, pinnedAt: true },
      });
      const membership = await prisma.channelMember.findUnique({
        where: {
          channelId_profileId: { channelId: message.channelId, profileId: args.profileId },
        },
      });
      if (!membership) throw new Error("You must be a member of the channel to pin messages.");
      if (message.pinnedAt) throw new Error("This message is already pinned.");
      return prisma.channelMessage.update({
        ...query,
        where: { id: args.messageId },
        data: { pinnedAt: new Date(), pinnedByProfileId: args.profileId },
      });
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
      const message = await prisma.channelMessage.findUniqueOrThrow({
        where: { id: args.messageId },
        select: { channelId: true, pinnedAt: true },
      });
      const membership = await prisma.channelMember.findUnique({
        where: {
          channelId_profileId: { channelId: message.channelId, profileId: args.profileId },
        },
      });
      if (!membership) throw new Error("You must be a member of the channel to unpin messages.");
      if (!message.pinnedAt) throw new Error("This message is not pinned.");
      return prisma.channelMessage.update({
        ...query,
        where: { id: args.messageId },
        data: { pinnedAt: null, pinnedByProfileId: null },
      });
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
      const channel = await prisma.channel.findUnique({
        where: { id: args.channelId },
        select: { visibility: true },
      });
      if (!channel) {
        throw new Error("Channel not found.");
      }
      if (channel.visibility === "dm") {
        throw new Error("Direct message conversations cannot be deleted.");
      }
      const member = await prisma.channelMember.findUnique({
        where: {
          channelId_profileId: { channelId: args.channelId, profileId: args.profileId },
        },
        select: { role: true },
      });
      if (!member || member.role !== "creator") {
        throw new Error("Only the channel creator can delete the channel.");
      }
      await prisma.channel.delete({ where: { id: args.channelId } });
      return true;
    },
  }),
);
