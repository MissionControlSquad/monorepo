-- AlterEnum
ALTER TYPE "UserNotificationType" ADD VALUE 'document_added';

-- AlterTable
ALTER TABLE "user_notification_preferences" ADD COLUMN "documentAdded" BOOLEAN NOT NULL DEFAULT true;
