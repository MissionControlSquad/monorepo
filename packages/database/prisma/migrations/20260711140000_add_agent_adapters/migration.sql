-- Epic #2 slice 1: pluggable agent-adapter registry (global platform config). Additive; existing
-- OpenClaw agents are backfilled to the builtIn "openclaw-gateway" adapter so nothing breaks.

CREATE TYPE "AdapterTransport" AS ENUM ('local', 'gateway', 'cloud');
CREATE TYPE "AdapterAuthKind" AS ENUM ('none', 'apiKey', 'subscription', 'secretBinding');

CREATE TABLE "agent_adapters" (
  "id"           TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "displayName"  TEXT NOT NULL,
  "transport"    "AdapterTransport" NOT NULL DEFAULT 'local',
  "authKind"     "AdapterAuthKind" NOT NULL DEFAULT 'apiKey',
  "configSchema" JSONB NOT NULL,
  "version"      TEXT NOT NULL DEFAULT '1.0.0',
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "builtIn"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_adapters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_adapters_type_key" ON "agent_adapters"("type");
CREATE INDEX "agent_adapters_enabled_idx" ON "agent_adapters"("enabled");

CREATE TABLE "adapter_model_profiles" (
  "id"            TEXT NOT NULL,
  "adapterType"   TEXT NOT NULL,
  "modelId"       TEXT NOT NULL,
  "displayName"   TEXT NOT NULL,
  "contextWindow" INTEGER,
  "isDefault"     BOOLEAN NOT NULL DEFAULT false,
  "detected"      BOOLEAN NOT NULL DEFAULT false,
  "metadata"      JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "adapter_model_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "adapter_model_profiles_adapterType_modelId_key" ON "adapter_model_profiles"("adapterType", "modelId");
CREATE INDEX "adapter_model_profiles_adapterType_idx" ON "adapter_model_profiles"("adapterType");

ALTER TABLE "adapter_model_profiles" ADD CONSTRAINT "adapter_model_profiles_adapterType_fkey"
  FOREIGN KEY ("adapterType") REFERENCES "agent_adapters"("type") ON DELETE CASCADE ON UPDATE CASCADE;

-- Agent gains a nullable adapter reference (tightened to NOT NULL in a follow-up once backfilled).
ALTER TABLE "agents" ADD COLUMN "adapterType" TEXT;
ALTER TABLE "agents" ADD COLUMN "adapterConfig" JSONB;
CREATE INDEX "agents_adapterType_idx" ON "agents"("adapterType");
ALTER TABLE "agents" ADD CONSTRAINT "agents_adapterType_fkey"
  FOREIGN KEY ("adapterType") REFERENCES "agent_adapters"("type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed built-in + provider adapters (idempotent). openclaw-gateway is builtIn and always resolvable.
INSERT INTO "agent_adapters" ("id","type","displayName","transport","authKind","configSchema","builtIn","enabled","createdAt","updatedAt")
VALUES
 (gen_random_uuid(),'openclaw-gateway','OpenClaw (Gateway)','gateway','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","required":["agentCenterUrl","token"],"properties":{"agentCenterUrl":{"type":"string"},"token":{"type":"string"},"fingerprint":{"type":"string"},"reconnectBaseMs":{"type":"number"},"reconnectMaxMs":{"type":"number"}}}'::jsonb, true, true, now(), now()),
 (gen_random_uuid(),'claude-local','Claude (Local CLI)','local','subscription',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"},"maxTurnsPerRun":{"type":"number"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'codex-local','Codex (Local CLI)','local','subscription',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'cursor-local','Cursor (Local)','local','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'cursor-cloud','Cursor (Cloud)','cloud','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'gemini-local','Gemini (Local CLI)','local','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'grok-local','Grok (Local CLI)','local','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"},"maxTurns":{"type":"number"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'opencode-local','OpenCode (Local)','local','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'pi-local','Pi (Local)','local','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'hermes','Hermes','local','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"}}}'::jsonb, false, true, now(), now()),
 (gen_random_uuid(),'hermes-gateway','Hermes (Gateway)','gateway','apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{}}'::jsonb, false, true, now(), now())
ON CONFLICT ("type") DO NOTHING;

-- Backfill all existing agents to the OpenClaw adapter (every agent today is OpenClaw).
UPDATE "agents" SET "adapterType" = 'openclaw-gateway' WHERE "adapterType" IS NULL;
