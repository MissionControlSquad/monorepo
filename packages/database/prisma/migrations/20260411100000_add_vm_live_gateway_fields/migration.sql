-- CreateEnum
CREATE TYPE "VMConnectionStatus" AS ENUM ('connected', 'disconnected');

-- AlterTable: add Live Gateway fields to cloud_vms
ALTER TABLE "cloud_vms"
    ADD COLUMN "vmToken"            TEXT,
    ADD COLUMN "vmFingerprint"      TEXT,
    ADD COLUMN "connectionStatus"   "VMConnectionStatus" NOT NULL DEFAULT 'disconnected',
    ADD COLUMN "connectedAt"        TIMESTAMP(3),
    ADD COLUMN "lastDisconnectedAt" TIMESTAMP(3),
    ADD COLUMN "pluginVersion"      TEXT,
    ADD COLUMN "hostMeta"           JSONB;

-- CreateIndex: unique fingerprint
CREATE UNIQUE INDEX "cloud_vms_vmFingerprint_key" ON "cloud_vms"("vmFingerprint");

-- CreateIndex: connection status lookup
CREATE INDEX "cloud_vms_connectionStatus_idx" ON "cloud_vms"("connectionStatus");

-- CreateTable: pending_task_deliveries (offline queue for live task delivery)
CREATE TABLE "pending_task_deliveries" (
    "id"             TEXT NOT NULL,
    "vmId"           TEXT NOT NULL,
    "agentSlug"      TEXT NOT NULL,
    "taskId"         TEXT NOT NULL,
    "message"        TEXT NOT NULL,
    "priority"       TEXT NOT NULL DEFAULT 'medium',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "delivered"      BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt"    TIMESTAMP(3),

    CONSTRAINT "pending_task_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: idempotency uniqueness — prevents double-delivery at DB level
CREATE UNIQUE INDEX "pending_task_deliveries_idempotencyKey_key" ON "pending_task_deliveries"("idempotencyKey");

-- CreateIndex: drain-queue lookup (vmId + delivered)
CREATE INDEX "pending_task_deliveries_vmId_delivered_idx" ON "pending_task_deliveries"("vmId", "delivered");

-- CreateIndex: TTL expiry scan (vmId + delivered + expiresAt)
CREATE INDEX "pending_task_deliveries_vmId_delivered_expiresAt_idx" ON "pending_task_deliveries"("vmId", "delivered", "expiresAt");

-- AddForeignKey
ALTER TABLE "pending_task_deliveries"
    ADD CONSTRAINT "pending_task_deliveries_vmId_fkey"
    FOREIGN KEY ("vmId") REFERENCES "cloud_vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
