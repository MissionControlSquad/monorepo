-- CreateTable
CREATE TABLE "live_gateway_devices" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "machineFingerprint" TEXT NOT NULL,
    "publicKeyRaw" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedByProfileId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_gateway_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_gateway_devices_machineFingerprint_key" ON "live_gateway_devices"("machineFingerprint");
CREATE INDEX "live_gateway_devices_workspaceId_status_idx" ON "live_gateway_devices"("workspaceId", "status");
