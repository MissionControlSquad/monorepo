-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "system_settings" ADD COLUMN "onboardingCategoryId" TEXT;
