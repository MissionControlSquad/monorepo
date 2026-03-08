-- AlterTable: add pinned support to channel_messages
ALTER TABLE "channel_messages" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);
ALTER TABLE "channel_messages" ADD COLUMN IF NOT EXISTS "pinnedByProfileId" TEXT;

-- CreateIndex for pinned list query
CREATE INDEX IF NOT EXISTS "channel_messages_channelId_pinnedAt_idx" ON "channel_messages"("channelId", "pinnedAt");

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_pinnedByProfileId_fkey" 
  FOREIGN KEY ("pinnedByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
