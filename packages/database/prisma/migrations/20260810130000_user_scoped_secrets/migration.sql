-- Parity §3 #7: user-scoped secret DEFINITIONS (what a workspace expects each member to provide) +
-- DECLARATIONS (whether a given member has provided it) + coverage. Purely additive: two new tables
-- and one enum. A declaration points at an existing personal `secrets` row (SET NULL keeps the
-- declaration as "missing" if that secret is deleted) — no plaintext is ever stored here. workspaceId
-- is a buildbase id (no FK, D5); createdByProfileId / profileId are buildbase userIds (no FK).

-- CreateEnum
CREATE TYPE "UserSecretDeclarationStatus" AS ENUM ('provided', 'missing');

-- CreateTable
CREATE TABLE "user_secret_definitions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdByProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_secret_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_secret_declarations" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "secretId" TEXT,
    "secretVersionId" TEXT,
    "status" "UserSecretDeclarationStatus" NOT NULL DEFAULT 'missing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_secret_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_secret_definitions_workspaceId_key_key" ON "user_secret_definitions"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "user_secret_definitions_workspaceId_idx" ON "user_secret_definitions"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_secret_declarations_definitionId_profileId_key" ON "user_secret_declarations"("definitionId", "profileId");

-- CreateIndex
CREATE INDEX "user_secret_declarations_workspaceId_idx" ON "user_secret_declarations"("workspaceId");

-- CreateIndex
CREATE INDEX "user_secret_declarations_profileId_idx" ON "user_secret_declarations"("profileId");

-- CreateIndex
CREATE INDEX "user_secret_declarations_secretId_idx" ON "user_secret_declarations"("secretId");

-- AddForeignKey
ALTER TABLE "user_secret_declarations" ADD CONSTRAINT "user_secret_declarations_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "user_secret_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_secret_declarations" ADD CONSTRAINT "user_secret_declarations_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "secrets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
