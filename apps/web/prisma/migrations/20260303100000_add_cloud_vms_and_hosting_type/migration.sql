-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('provisioning', 'installing', 'running', 'stopped', 'error', 'destroying', 'destroyed');

-- CreateEnum
CREATE TYPE "DeploymentProvider" AS ENUM ('hetzner');

-- CreateEnum
CREATE TYPE "HostingType" AS ENUM ('selfHosted', 'cloudVM');

-- CreateTable
CREATE TABLE "cloud_vms" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "provider" "DeploymentProvider" NOT NULL DEFAULT 'hetzner',
    "status" "DeploymentStatus" NOT NULL DEFAULT 'provisioning',
    "externalServerId" TEXT,
    "serverName" TEXT,
    "ipv4" TEXT,
    "region" TEXT NOT NULL DEFAULT 'fsn1',
    "serverType" TEXT NOT NULL DEFAULT 'cx22',
    "webhookSecret" TEXT,
    "sshPrivateKey" TEXT,
    "sshPublicKey" TEXT,
    "hetznerSshKeyId" TEXT,
    "setupStep" TEXT,
    "setupProgress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorAt" TIMESTAMP(3),
    "provisionedAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "destroyedAt" TIMESTAMP(3),
    "totalUptimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "llmConfigured" BOOLEAN NOT NULL DEFAULT false,
    "llmProvider" TEXT,
    "llmModel" TEXT,
    "gatewayToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_vms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_vm_logs" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_vm_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_vm_usage" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "uptimeSeconds" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,

    CONSTRAINT "cloud_vm_usage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "agents" ADD COLUMN "hostingType" "HostingType" NOT NULL DEFAULT 'selfHosted';
ALTER TABLE "agents" ADD COLUMN "cloudVmId" TEXT;

-- CreateIndex
CREATE INDEX "cloud_vms_status_idx" ON "cloud_vms"("status");

-- CreateIndex
CREATE INDEX "cloud_vm_logs_vmId_createdAt_idx" ON "cloud_vm_logs"("vmId", "createdAt");

-- CreateIndex
CREATE INDEX "cloud_vm_usage_vmId_idx" ON "cloud_vm_usage"("vmId");

-- CreateIndex
CREATE INDEX "agents_cloudVmId_idx" ON "agents"("cloudVmId");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_cloudVmId_fkey" FOREIGN KEY ("cloudVmId") REFERENCES "cloud_vms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_vm_logs" ADD CONSTRAINT "cloud_vm_logs_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "cloud_vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_vm_usage" ADD CONSTRAINT "cloud_vm_usage_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "cloud_vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
