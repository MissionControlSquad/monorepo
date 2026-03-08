-- Channel creator: use only Profile (drop createdByAgentId)
-- Prerequisite: backfill has set createdByProfileId for all channels

-- Ensure no channel is missing createdByProfileId (safety check would be application-level)
ALTER TABLE "channels" ALTER COLUMN "createdByProfileId" SET NOT NULL;

-- Drop the agent creator column and its FK/index
ALTER TABLE "channels" DROP CONSTRAINT IF EXISTS "channels_createdByAgentId_fkey";
DROP INDEX IF EXISTS "channels_createdByAgentId_idx";
ALTER TABLE "channels" DROP COLUMN IF EXISTS "createdByAgentId";
