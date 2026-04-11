-- Live Gateway: additive tables only — no changes to existing tables.
-- Apply with: npx prisma migrate deploy

-- ── Replay prevention ────────────────────────────────────────────────────────
CREATE TABLE "used_nonces" (
    "nonce"   TEXT        NOT NULL,
    "usedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "used_nonces_pkey" PRIMARY KEY ("nonce")
);
CREATE INDEX "used_nonces_usedAt_idx" ON "used_nonces"("usedAt");

-- ── Install tokens ───────────────────────────────────────────────────────────
CREATE TABLE "live_gateway_tokens" (
    "id"          TEXT        NOT NULL,
    "tokenHash"   TEXT        NOT NULL,
    "tokenPrefix" VARCHAR(8)  NOT NULL,
    "name"        TEXT,
    "isActive"    BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"  TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),
    CONSTRAINT "live_gateway_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "live_gateway_tokens_tokenHash_key" ON "live_gateway_tokens"("tokenHash");
CREATE INDEX "live_gateway_tokens_isActive_idx" ON "live_gateway_tokens"("isActive");

-- ── Connected machines ───────────────────────────────────────────────────────
CREATE TABLE "live_gateway_connections" (
    "id"                 TEXT        NOT NULL,
    "machineFingerprint" TEXT        NOT NULL,
    "connectionToken"    TEXT,
    "machineName"        VARCHAR(255),
    "connectionStatus"   TEXT        NOT NULL DEFAULT 'disconnected',
    "connectedAt"        TIMESTAMP(3),
    "lastDisconnectedAt" TIMESTAMP(3),
    "pluginVersion"      TEXT,
    "hostMeta"           JSONB,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "live_gateway_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "live_gateway_connections_machineFingerprint_key"
    ON "live_gateway_connections"("machineFingerprint");
CREATE INDEX "live_gateway_connections_connectionStatus_idx"
    ON "live_gateway_connections"("connectionStatus");

-- ── Agent slug → connection routing ─────────────────────────────────────────
CREATE TABLE "live_agent_routes" (
    "id"           TEXT        NOT NULL,
    "connectionId" TEXT        NOT NULL,
    "agentSlug"    TEXT        NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "live_agent_routes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "live_agent_routes_connectionId_agentSlug_key"
    ON "live_agent_routes"("connectionId", "agentSlug");
CREATE INDEX "live_agent_routes_agentSlug_idx" ON "live_agent_routes"("agentSlug");
ALTER TABLE "live_agent_routes"
    ADD CONSTRAINT "live_agent_routes_connectionId_fkey"
    FOREIGN KEY ("connectionId")
    REFERENCES "live_gateway_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Offline delivery queue ───────────────────────────────────────────────────
CREATE TABLE "live_pending_deliveries" (
    "id"             TEXT        NOT NULL,
    "connectionId"   TEXT        NOT NULL,
    "agentSlug"      TEXT        NOT NULL,
    "taskId"         TEXT        NOT NULL,
    "message"        TEXT        NOT NULL,
    "priority"       TEXT        NOT NULL DEFAULT 'normal',
    "idempotencyKey" TEXT        NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "delivered"      BOOLEAN     NOT NULL DEFAULT false,
    "deliveredAt"    TIMESTAMP(3),
    CONSTRAINT "live_pending_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "live_pending_deliveries_idempotencyKey_key"
    ON "live_pending_deliveries"("idempotencyKey");
CREATE INDEX "live_pending_deliveries_connectionId_delivered_idx"
    ON "live_pending_deliveries"("connectionId", "delivered");
CREATE INDEX "live_pending_deliveries_expiresAt_idx"
    ON "live_pending_deliveries"("expiresAt");
ALTER TABLE "live_pending_deliveries"
    ADD CONSTRAINT "live_pending_deliveries_connectionId_fkey"
    FOREIGN KEY ("connectionId")
    REFERENCES "live_gateway_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
