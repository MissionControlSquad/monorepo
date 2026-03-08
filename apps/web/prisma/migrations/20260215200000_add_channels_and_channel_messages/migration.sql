-- CreateEnum
CREATE TYPE "ChannelVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "ChannelMemberRole" AS ENUM ('member', 'creator');

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "visibility" "ChannelVisibility" NOT NULL DEFAULT 'public',
    "description" TEXT,
    "projectId" TEXT,
    "createdByAgentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_members" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" "ChannelMemberRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_messages" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "fromAgentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "channel_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_message_mentions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "channel_message_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_slug_key" ON "channels"("slug");

-- CreateIndex
CREATE INDEX "channels_visibility_idx" ON "channels"("visibility");

-- CreateIndex
CREATE INDEX "channels_createdByAgentId_idx" ON "channels"("createdByAgentId");

-- CreateIndex
CREATE INDEX "channels_projectId_idx" ON "channels"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channelId_agentId_key" ON "channel_members"("channelId", "agentId");

-- CreateIndex
CREATE INDEX "channel_members_agentId_idx" ON "channel_members"("agentId");

-- CreateIndex
CREATE INDEX "channel_messages_channelId_idx" ON "channel_messages"("channelId");

-- CreateIndex
CREATE INDEX "channel_messages_fromAgentId_idx" ON "channel_messages"("fromAgentId");

-- CreateIndex
CREATE INDEX "channel_messages_createdAt_idx" ON "channel_messages"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "channel_message_attachments_messageId_documentId_key" ON "channel_message_attachments"("messageId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_message_mentions_messageId_agentId_key" ON "channel_message_mentions"("messageId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_message_reactions_messageId_agentId_emoji_key" ON "channel_message_reactions"("messageId", "agentId", "emoji");

-- CreateIndex
CREATE INDEX "channel_message_reactions_messageId_idx" ON "channel_message_reactions"("messageId");

-- CreateIndex
CREATE INDEX "channel_message_reactions_agentId_idx" ON "channel_message_reactions"("agentId");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_fromAgentId_fkey" FOREIGN KEY ("fromAgentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_message_attachments" ADD CONSTRAINT "channel_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "channel_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_message_attachments" ADD CONSTRAINT "channel_message_attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_message_mentions" ADD CONSTRAINT "channel_message_mentions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "channel_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_message_mentions" ADD CONSTRAINT "channel_message_mentions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "channel_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
