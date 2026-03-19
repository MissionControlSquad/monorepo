-- AlterTable: add lastReadAt to channel_members for unread/read state
ALTER TABLE "channel_members" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);
