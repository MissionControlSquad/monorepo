-- Add liveGatewayTokenId to CloudVM so each VM can be linked to its
-- live gateway install token for revocation on destroy.
ALTER TABLE "cloud_vms" ADD COLUMN "liveGatewayTokenId" TEXT;
CREATE UNIQUE INDEX "cloud_vms_liveGatewayTokenId_key" ON "cloud_vms"("liveGatewayTokenId");
