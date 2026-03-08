-- Channel tables: profile only, no legacy agent columns

-- channel_members
ALTER TABLE "channel_members" DROP CONSTRAINT IF EXISTS "channel_members_agentId_fkey";
ALTER TABLE "channel_members" DROP CONSTRAINT IF EXISTS "channel_members_channelId_agentId_key";
ALTER TABLE "channel_members" ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "channel_members" DROP COLUMN IF EXISTS "agentId";
DROP INDEX IF EXISTS "channel_members_agentId_idx";

-- channel_messages
ALTER TABLE "channel_messages" DROP CONSTRAINT IF EXISTS "channel_messages_fromAgentId_fkey";
ALTER TABLE "channel_messages" ALTER COLUMN "fromProfileId" SET NOT NULL;
ALTER TABLE "channel_messages" DROP COLUMN IF EXISTS "fromAgentId";
DROP INDEX IF EXISTS "channel_messages_fromAgentId_idx";

-- channel_message_mentions
ALTER TABLE "channel_message_mentions" DROP CONSTRAINT IF EXISTS "channel_message_mentions_agentId_fkey";
ALTER TABLE "channel_message_mentions" DROP CONSTRAINT IF EXISTS "channel_message_mentions_messageId_agentId_key";
ALTER TABLE "channel_message_mentions" ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "channel_message_mentions" DROP COLUMN IF EXISTS "agentId";

-- channel_message_reactions
ALTER TABLE "channel_message_reactions" DROP CONSTRAINT IF EXISTS "channel_message_reactions_agentId_fkey";
ALTER TABLE "channel_message_reactions" DROP CONSTRAINT IF EXISTS "channel_message_reactions_messageId_agentId_emoji_key";
ALTER TABLE "channel_message_reactions" ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "channel_message_reactions" DROP COLUMN IF EXISTS "agentId";
DROP INDEX IF EXISTS "channel_message_reactions_agentId_idx";
