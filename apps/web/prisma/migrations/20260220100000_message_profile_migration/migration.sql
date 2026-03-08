-- Message: fromAgentId -> fromProfileId
ALTER TABLE "messages" ADD COLUMN "fromProfileId" TEXT;

-- Backfill: resolve agent -> profile for existing messages
UPDATE "messages" m
SET "fromProfileId" = p.id
FROM "profiles" p
WHERE p."agentId" = m."fromAgentId";

-- Make NOT NULL after backfill
ALTER TABLE "messages" ALTER COLUMN "fromProfileId" SET NOT NULL;

-- Drop old FK and index
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_fromAgentId_fkey";
DROP INDEX IF EXISTS "messages_fromAgentId_idx";
ALTER TABLE "messages" DROP COLUMN "fromAgentId";

-- Add new FK and index
ALTER TABLE "messages" ADD CONSTRAINT "messages_fromProfileId_fkey" FOREIGN KEY ("fromProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "messages_fromProfileId_idx" ON "messages"("fromProfileId");

-- MessageMention: agentId -> profileId
ALTER TABLE "message_mentions" ADD COLUMN "profileId" TEXT;

-- Backfill
UPDATE "message_mentions" mm
SET "profileId" = p.id
FROM "profiles" p
WHERE p."agentId" = mm."agentId";

ALTER TABLE "message_mentions" ALTER COLUMN "profileId" SET NOT NULL;

-- Drop old constraint, FK
ALTER TABLE "message_mentions" DROP CONSTRAINT IF EXISTS "message_mentions_messageId_agentId_key";
ALTER TABLE "message_mentions" DROP CONSTRAINT IF EXISTS "message_mentions_agentId_fkey";
ALTER TABLE "message_mentions" DROP COLUMN "agentId";

-- Add new FK and unique constraint
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_messageId_profileId_key" UNIQUE ("messageId", "profileId");

-- MessageReaction: agentId -> profileId
ALTER TABLE "message_reactions" ADD COLUMN "profileId" TEXT;

-- Backfill
UPDATE "message_reactions" mr
SET "profileId" = p.id
FROM "profiles" p
WHERE p."agentId" = mr."agentId";

ALTER TABLE "message_reactions" ALTER COLUMN "profileId" SET NOT NULL;

-- Drop old constraint, FK, index
ALTER TABLE "message_reactions" DROP CONSTRAINT IF EXISTS "message_reactions_messageId_agentId_emoji_key";
ALTER TABLE "message_reactions" DROP CONSTRAINT IF EXISTS "message_reactions_agentId_fkey";
DROP INDEX IF EXISTS "message_reactions_agentId_idx";
ALTER TABLE "message_reactions" DROP COLUMN "agentId";

-- Add new FK, unique constraint, index
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_profileId_emoji_key" UNIQUE ("messageId", "profileId", "emoji");
CREATE INDEX "message_reactions_profileId_idx" ON "message_reactions"("profileId");
