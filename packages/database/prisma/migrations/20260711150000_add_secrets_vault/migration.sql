-- Epic #5: workspace-scoped secrets vault (values stored ONLY as AES-256-GCM ciphertext).
-- 5 new tables; no backfill (start empty). providerId null = local envelope-encrypted default.

CREATE TYPE "SecretProviderKind" AS ENUM ('env', 'aws', 'vault');
CREATE TYPE "SecretBindingScope" AS ENUM ('agent', 'adapter');
CREATE TYPE "SecretAccessAction" AS ENUM ('created', 'read', 'rotated', 'bound', 'unbound', 'revealed', 'injected');

CREATE TABLE "secret_provider_configs" (
  "id"            TEXT NOT NULL,
  "workspaceId"   TEXT NOT NULL,
  "kind"          "SecretProviderKind" NOT NULL DEFAULT 'env',
  "name"          TEXT NOT NULL,
  "config"        JSONB NOT NULL,
  "healthy"       BOOLEAN NOT NULL DEFAULT false,
  "lastCheckedAt" TIMESTAMP(3),
  "lastError"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "secret_provider_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "secret_provider_configs_workspaceId_name_key" ON "secret_provider_configs"("workspaceId", "name");
CREATE INDEX "secret_provider_configs_workspaceId_idx" ON "secret_provider_configs"("workspaceId");

CREATE TABLE "secrets" (
  "id"             TEXT NOT NULL,
  "workspaceId"    TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "providerId"     TEXT,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "secrets_workspaceId_name_key" ON "secrets"("workspaceId", "name");
CREATE INDEX "secrets_workspaceId_idx" ON "secrets"("workspaceId");

CREATE TABLE "secret_versions" (
  "id"         TEXT NOT NULL,
  "secretId"   TEXT NOT NULL,
  "version"    INTEGER NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "keyId"      TEXT NOT NULL DEFAULT 'env',
  "createdBy"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt"  TIMESTAMP(3),
  CONSTRAINT "secret_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "secret_versions_secretId_version_key" ON "secret_versions"("secretId", "version");
CREATE INDEX "secret_versions_secretId_idx" ON "secret_versions"("secretId");

CREATE TABLE "secret_bindings" (
  "id"            TEXT NOT NULL,
  "secretId"      TEXT NOT NULL,
  "scope"         "SecretBindingScope" NOT NULL,
  "agentId"       TEXT,
  "adapterType"   TEXT,
  "envVarName"    TEXT NOT NULL,
  "pinnedVersion" INTEGER,
  "createdBy"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "secret_bindings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "secret_bindings_agentId_envVarName_key" ON "secret_bindings"("agentId", "envVarName");
CREATE INDEX "secret_bindings_secretId_idx" ON "secret_bindings"("secretId");
CREATE INDEX "secret_bindings_agentId_idx" ON "secret_bindings"("agentId");
CREATE INDEX "secret_bindings_adapterType_idx" ON "secret_bindings"("adapterType");

CREATE TABLE "secret_access_events" (
  "id"        TEXT NOT NULL,
  "secretId"  TEXT NOT NULL,
  "action"    "SecretAccessAction" NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId"   TEXT,
  "agentId"   TEXT,
  "version"   INTEGER,
  "metadata"  JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "secret_access_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "secret_access_events_secretId_createdAt_idx" ON "secret_access_events"("secretId", "createdAt");
CREATE INDEX "secret_access_events_agentId_idx" ON "secret_access_events"("agentId");

ALTER TABLE "secrets" ADD CONSTRAINT "secrets_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "secret_provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_secretId_fkey"
  FOREIGN KEY ("secretId") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_secretId_fkey"
  FOREIGN KEY ("secretId") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "secret_bindings" ADD CONSTRAINT "secret_bindings_adapterType_fkey"
  FOREIGN KEY ("adapterType") REFERENCES "agent_adapters"("type") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "secret_access_events" ADD CONSTRAINT "secret_access_events_secretId_fkey"
  FOREIGN KEY ("secretId") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
