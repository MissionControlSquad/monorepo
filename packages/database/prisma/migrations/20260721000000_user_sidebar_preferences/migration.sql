-- Paperclip parity: per-user sidebar nav customization (order + hidden items).
CREATE TABLE "user_sidebar_preferences" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderedIds" JSONB NOT NULL DEFAULT '[]',
    "hiddenIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_sidebar_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_sidebar_preferences_workspaceId_userId_key" ON "user_sidebar_preferences"("workspaceId", "userId");
CREATE INDEX "user_sidebar_preferences_workspaceId_idx" ON "user_sidebar_preferences"("workspaceId");
