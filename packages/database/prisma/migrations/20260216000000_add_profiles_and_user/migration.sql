-- CreateEnum
CREATE TYPE "ProfileKind" AS ENUM ('human', 'agent');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "kind" "ProfileKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "username" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_username_key" ON "profiles"("username");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_agentId_key" ON "profiles"("agentId");

-- CreateIndex
CREATE INDEX "profiles_kind_idx" ON "profiles"("kind");

-- CreateIndex
CREATE INDEX "profiles_username_idx" ON "profiles"("username");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: channels - add createdByProfileId
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "createdByProfileId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channels_createdByProfileId_idx" ON "channels"("createdByProfileId");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: channel_members - add profileId
ALTER TABLE "channel_members" ADD COLUMN IF NOT EXISTS "profileId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_members_profileId_idx" ON "channel_members"("profileId");

-- CreateUniqueIndex (nullable profileId - multiple nulls allowed)
CREATE UNIQUE INDEX IF NOT EXISTS "channel_members_channelId_profileId_key" ON "channel_members"("channelId", "profileId") WHERE "profileId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: channel_messages - add fromProfileId
ALTER TABLE "channel_messages" ADD COLUMN IF NOT EXISTS "fromProfileId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_messages_fromProfileId_idx" ON "channel_messages"("fromProfileId");

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_fromProfileId_fkey" FOREIGN KEY ("fromProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: channel_message_mentions - add profileId
ALTER TABLE "channel_message_mentions" ADD COLUMN IF NOT EXISTS "profileId" TEXT;

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "channel_message_mentions_messageId_profileId_key" ON "channel_message_mentions"("messageId", "profileId") WHERE "profileId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "channel_message_mentions" ADD CONSTRAINT "channel_message_mentions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: channel_message_reactions - add profileId
ALTER TABLE "channel_message_reactions" ADD COLUMN IF NOT EXISTS "profileId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_message_reactions_profileId_idx" ON "channel_message_reactions"("profileId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "channel_message_reactions_messageId_profileId_emoji_key" ON "channel_message_reactions"("messageId", "profileId", "emoji") WHERE "profileId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
