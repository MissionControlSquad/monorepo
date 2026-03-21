/**
 * @agentcenter/database - Channel Operations
 *
 * Create a channel message with optional attachments and mentions.
 */

import { prisma } from "../client";

const PROFILE_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  username: true,
  avatarUrl: true,
} as const;

export interface CreateChannelMessageInput {
  channelId: string;
  fromProfileId: string;
  content: string;
  attachmentDocumentIds?: string[];
  mentionProfileIds?: string[];
}

export async function createChannelMessage(input: CreateChannelMessageInput) {
  const { channelId, fromProfileId, content, attachmentDocumentIds = [], mentionProfileIds = [] } =
    input;

  return prisma.channelMessage.create({
    data: {
      channelId,
      fromProfileId,
      content,
      attachments: {
        create: attachmentDocumentIds.map((documentId) => ({ documentId })),
      },
      mentions: {
        create: mentionProfileIds.map((profileId) => ({ profileId })),
      },
    },
    include: {
      fromProfile: { select: PROFILE_SELECT },
      attachments: {
        include: { document: { select: { id: true, title: true, type: true } } },
      },
      mentions: {
        include: { profile: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
      },
    },
  });
}
