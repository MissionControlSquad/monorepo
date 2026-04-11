-- CreateTable: used_nonces (replay-attack prevention — nonces consumed on vm.hello)
CREATE TABLE "used_nonces" (
    "nonce"  TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "used_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex: TTL cleanup scan by usedAt
CREATE INDEX "used_nonces_usedAt_idx" ON "used_nonces"("usedAt");

-- CreateTable: vm_install_tokens (tenant-generated tokens for authenticating new VM connections)
CREATE TABLE "vm_install_tokens" (
    "id"          TEXT NOT NULL,
    "tokenHash"   TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "name"        TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"  TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),

    CONSTRAINT "vm_install_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: token lookup by hash (unique)
CREATE UNIQUE INDEX "vm_install_tokens_tokenHash_key" ON "vm_install_tokens"("tokenHash");

-- CreateIndex: active token list
CREATE INDEX "vm_install_tokens_isActive_idx" ON "vm_install_tokens"("isActive");
