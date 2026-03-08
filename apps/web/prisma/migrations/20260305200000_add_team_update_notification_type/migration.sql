-- AlterEnum
ALTER TYPE "UserNotificationType" ADD VALUE 'team_update';

-- AlterTable
ALTER TABLE "user_notification_preferences" ADD COLUMN "teamUpdate" BOOLEAN NOT NULL DEFAULT true;
