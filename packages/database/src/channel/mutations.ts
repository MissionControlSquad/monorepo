/** @agentcenter/database - Channel Mutation Operations
 * Service functions for creating/updating/deleting channels, members, and messages.
 */

import { prisma } from "../client";
import type { ChannelMemberRole } from "@prisma/client";

// ─── Channel CRUD ────────────────────────────────────────────────────

/** Create a channel (team/public/private) with an initial creator member. */
export async function createTeamChannel(
  data: {
    name: string;
    slug: string;
    visibility: "public" | "private";
    description?: string;
    projectId?: string;
    createdByProfileId: string;
  },
  query?: Record<string, unknown>,
) {
  return prisma.channel.create({
    ...query,
    data: {
      name: data.name,
      slug: data.slug,
      visibility: data.visibility,
      description: data.description,
      projectId: data.projectId,
      createdByProfileId: data.createdByProfileId,
      members: {
        create: {
          profileId: data.createdByProfileId,
          role: "creator",
        },
      },
    },
  });
}

/** Find a channel by slug (nullable). Accepts an optional Pothos query spread. */
export async function findChannelBySlugNullable(slug: string, query?: Record<string, unknown>) {
  return prisma.channel.findUnique({
    ...query,
    where: { slug },
  });
}

/** Create a DM channel between two profiles. */
export async function createDmChannelFull(
  data: {
    slug: string;
    createdByProfileId: string;
    otherProfileId: string;
  },
  query?: Record<string, unknown>,
) {
  return prisma.channel.create({
    ...query,
    data: {
      name: "Direct message",
      slug: data.slug,
      visibility: "dm",
      projectId: null,
      createdByProfileId: data.createdByProfileId,
      members: {
        create: [
          { profileId: data.createdByProfileId, role: "creator" },
          { profileId: data.otherProfileId, role: "member" },
        ],
      },
    },
  });
}

/** Get a channel with its visibility (for membership checks). Throws if not found. */
export async function getChannelVisibilityOrThrow(channelId: string) {
  return prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: { visibility: true, createdByProfileId: true },
  });
}

/** Find a channel by id (nullable), with visibility only. */
export async function findChannelById(channelId: string) {
  return prisma.channel.findUnique({
    where: { id: channelId },
    select: { visibility: true },
  });
}

/** Delete a channel by id. */
export async function deleteChannel(channelId: string) {
  return prisma.channel.delete({ where: { id: channelId } });
}

/** List channels matching a where clause. Accepts Pothos query spread. */
export async function listChannels(
  where: Record<string, unknown>,
  opts: { take?: number; orderBy?: Record<string, unknown> },
  query?: Record<string, unknown>,
) {
  return prisma.channel.findMany({
    ...query,
    where,
    orderBy: opts.orderBy ?? { updatedAt: "desc" },
    take: opts.take,
  });
}

/** Find a channel by id — for Pothos queries. Accepts Pothos query spread. */
export async function findChannelByIdQuery(channelId: string, query?: Record<string, unknown>) {
  return prisma.channel.findUnique({
    ...query,
    where: { id: channelId },
  });
}

// ─── Channel Members ─────────────────────────────────────────────────

/** Find a single channel member record. */
export async function findChannelMemberRecord(channelId: string, profileId: string) {
  return prisma.channelMember.findUnique({
    where: { channelId_profileId: { channelId, profileId } },
  });
}

/** Find a channel member with only their role selected. */
export async function findChannelMemberRole(channelId: string, profileId: string) {
  return prisma.channelMember.findUnique({
    where: { channelId_profileId: { channelId, profileId } },
    select: { role: true },
  });
}

/** Create a channel member. Accepts Pothos query spread. */
export async function createChannelMember(
  channelId: string,
  profileId: string,
  role: ChannelMemberRole = "member",
  query?: Record<string, unknown>,
) {
  return prisma.channelMember.create({
    ...query,
    data: { channelId, profileId, role },
  });
}

/** Delete a channel member. */
export async function deleteChannelMember(channelId: string, profileId: string) {
  return prisma.channelMember.delete({
    where: { channelId_profileId: { channelId, profileId } },
  });
}

/** Mark only one member's lastReadAt (for markChannelRead — per-member, not bulk). */
export async function markChannelMemberRead(channelId: string, profileId: string) {
  return prisma.channelMember.updateMany({
    where: { channelId, profileId },
    data: { lastReadAt: new Date() },
  });
}

// ─── Channel Messages ─────────────────────────────────────────────────

/** Create an activity message (join/leave/add/remove) in a channel. */
export async function createChannelActivityMessage(
  channelId: string,
  fromProfileId: string,
  content: string,
  mentionedProfileIds: string[] = [],
) {
  return prisma.channelMessage.create({
    data: {
      channelId,
      fromProfileId,
      content,
      mentions: {
        create: mentionedProfileIds.map((profileId) => ({ profileId })),
      },
    },
  });
}

/** Create a user-authored channel message with optional attachments and mentions. */
export async function createChannelMessageFull(
  data: {
    channelId: string;
    fromProfileId: string;
    content: string;
    attachmentIds?: string[];
    mentionedProfileIds?: string[];
  },
  query?: Record<string, unknown>,
) {
  return prisma.channelMessage.create({
    ...query,
    data: {
      channelId: data.channelId,
      fromProfileId: data.fromProfileId,
      content: data.content,
      attachments: {
        create: (data.attachmentIds ?? []).map((documentId) => ({ documentId })),
      },
      mentions: {
        create: (data.mentionedProfileIds ?? []).map((profileId) => ({ profileId })),
      },
    },
  });
}

/** Get a channel message's channelId and fromProfileId. Throws if not found. */
export async function getChannelMessageOrThrow(messageId: string) {
  return prisma.channelMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: { id: true, channelId: true, fromProfileId: true },
  });
}

/** Get a channel message's channelId and pinnedAt status. Throws if not found. */
export async function getChannelMessagePinStatus(messageId: string) {
  return prisma.channelMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: { channelId: true, pinnedAt: true },
  });
}

/** Find an existing reaction for a given message/profile/emoji combo. */
export async function findChannelMessageReaction(
  messageId: string,
  profileId: string,
  emoji: string,
) {
  return prisma.channelMessageReaction.findUnique({
    where: {
      messageId_profileId_emoji: { messageId, profileId, emoji },
    },
  });
}

/** Delete a channel message reaction by its id. */
export async function deleteChannelMessageReaction(reactionId: string) {
  return prisma.channelMessageReaction.delete({ where: { id: reactionId } });
}

/** Create a channel message reaction. */
export async function createChannelMessageReaction(
  messageId: string,
  profileId: string,
  emoji: string,
) {
  return prisma.channelMessageReaction.create({
    data: { messageId, profileId, emoji },
  });
}

/** Fetch the updated channel message (with Pothos query spread) after a reaction toggle. */
export async function getChannelMessageWithQuery(messageId: string, query?: Record<string, unknown>) {
  return prisma.channelMessage.findUniqueOrThrow({
    ...query,
    where: { id: messageId },
  });
}

/** Delete old mentions and update message content + new mentions. */
export async function updateChannelMessageContent(
  messageId: string,
  content: string,
  mentionedProfileIds: string[],
  query?: Record<string, unknown>,
) {
  await prisma.channelMessageMention.deleteMany({ where: { messageId } });
  return prisma.channelMessage.update({
    ...query,
    where: { id: messageId },
    data: {
      content,
      mentions: {
        create: mentionedProfileIds.map((profileId) => ({ profileId })),
      },
    },
  });
}

/** Hard-delete a channel message. */
export async function deleteChannelMessage(messageId: string) {
  return prisma.channelMessage.delete({ where: { id: messageId } });
}

/** Pin a channel message. */
export async function pinChannelMessage(
  messageId: string,
  profileId: string,
  query?: Record<string, unknown>,
) {
  return prisma.channelMessage.update({
    ...query,
    where: { id: messageId },
    data: { pinnedAt: new Date(), pinnedByProfileId: profileId },
  });
}

/** Unpin a channel message. */
export async function unpinChannelMessage(messageId: string, query?: Record<string, unknown>) {
  return prisma.channelMessage.update({
    ...query,
    where: { id: messageId },
    data: { pinnedAt: null, pinnedByProfileId: null },
  });
}

// ─── Paginated Channel Message Queries ───────────────────────────────

const CHANNEL_MESSAGE_INCLUDE = {
  fromProfile: true,
  pinnedByProfile: true,
  reactions: { include: { profile: true } },
  mentions: { include: { profile: true } },
  attachments: { include: { document: true } },
};

/** Get the createdAt cursor for a channel message (for pagination). */
export async function getChannelMessageCursor(channelId: string, messageId: string) {
  return prisma.channelMessage.findFirst({
    where: { id: messageId, channelId },
    select: { createdAt: true },
  });
}

/** List channel messages older than a cursor date. */
export async function listChannelMessagesBeforeCursor(
  channelId: string,
  beforeCreatedAt: Date,
  take: number,
) {
  return prisma.channelMessage.findMany({
    where: { channelId, createdAt: { lt: beforeCreatedAt } },
    orderBy: { createdAt: "desc" },
    take,
    include: CHANNEL_MESSAGE_INCLUDE,
  });
}

/** List latest channel messages (newest first). */
export async function listLatestChannelMessages(channelId: string, take: number) {
  return prisma.channelMessage.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take,
    include: CHANNEL_MESSAGE_INCLUDE,
  });
}

/** List plain channel messages with Pothos query spread (simple queries). */
export async function listChannelMessagesSimple(
  channelId: string,
  take: number,
  orderBy: Record<string, unknown>,
  query?: Record<string, unknown>,
) {
  return prisma.channelMessage.findMany({
    ...query,
    where: { channelId },
    orderBy,
    take,
  });
}

/** List pinned messages in a channel. */
export async function listChannelPinnedMessages(
  channelId: string,
  take: number,
  query?: Record<string, unknown>,
) {
  return prisma.channelMessage.findMany({
    ...query,
    where: { channelId, pinnedAt: { not: null } },
    orderBy: { pinnedAt: "desc" },
    take,
  });
}

/** Search channel messages by content and/or mentioned profile. */
export async function searchChannelMessages(
  channelId: string,
  opts: { query?: string; mentionedProfileId?: string | null; take: number },
  pothosQuery?: Record<string, unknown>,
) {
  const where: Record<string, unknown> = { channelId };
  if (opts.query) where.content = { contains: opts.query, mode: "insensitive" };
  if (opts.mentionedProfileId) where.mentions = { some: { profileId: opts.mentionedProfileId } };
  return prisma.channelMessage.findMany({
    ...pothosQuery,
    where,
    orderBy: { createdAt: "desc" },
    take: opts.take,
  });
}

// ─── Profile helpers used in channel mutations ────────────────────────

/** Fetch all profiles (id, displayName, username) for mention resolution. */
export async function getAllProfilesForMentions() {
  return prisma.profile.findMany({
    select: { id: true, displayName: true, username: true },
  });
}

/** Fetch profiles for use as channels query (with Pothos query spread). */
export async function findProfilesQuery(
  where: Record<string, unknown>,
  query?: Record<string, unknown>,
) {
  return prisma.profile.findMany({ ...query, where });
}

/** Find a single profile by id with Pothos query spread. */
export async function findProfileByIdQuery(id: string, query?: Record<string, unknown>) {
  return prisma.profile.findUnique({ ...query, where: { id } });
}

/** Find a profile for agent-id lookup. */
export async function findProfileForAgentId(profileId: string) {
  return prisma.profile.findUnique({
    where: { id: profileId },
    select: { displayName: true },
  });
}

/** Channels in common between two profiles. */
export async function listChannelsInCommon(
  myProfileId: string,
  otherProfileId: string,
  take: number,
  query?: Record<string, unknown>,
) {
  return prisma.channel.findMany({
    ...query,
    where: {
      visibility: "private",
      AND: [
        { members: { some: { profileId: myProfileId } } },
        { members: { some: { profileId: otherProfileId } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
