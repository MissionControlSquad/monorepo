-- Epic #5: secret lifecycle status (active | disabled | archived).

ALTER TABLE "secrets"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
