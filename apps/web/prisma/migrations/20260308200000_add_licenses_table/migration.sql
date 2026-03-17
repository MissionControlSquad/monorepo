-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL DEFAULT 'active',
    "token" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "maxAgents" INTEGER NOT NULL DEFAULT -1,
    "maxProjects" INTEGER NOT NULL DEFAULT -1,
    "maxSeats" INTEGER NOT NULL DEFAULT -1,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instanceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);
