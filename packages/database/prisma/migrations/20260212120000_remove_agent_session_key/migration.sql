-- DropColumn: sessionKey from Agent (no longer used; auth is by API key, identity by id)
ALTER TABLE "agents" DROP COLUMN IF EXISTS "sessionKey";
