-- AlterTable
ALTER TABLE "user_notifications" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_notifications" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "user_notifications" ADD COLUMN "dedupKey" TEXT;

-- CreateIndex
CREATE INDEX "user_notifications_status_nextRetryAt_idx" ON "user_notifications"("status", "nextRetryAt");

-- CreateIndex (unique allows multiple NULLs in PostgreSQL)
CREATE UNIQUE INDEX "user_notifications_dedupKey_channel_key" ON "user_notifications"("dedupKey", "channel");
