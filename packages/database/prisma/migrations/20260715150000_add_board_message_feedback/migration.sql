-- Epic #15: operator feedback votes on assistant board turns.

ALTER TABLE "board_messages"
  ADD COLUMN "feedbackScore" INTEGER,
  ADD COLUMN "feedbackReason" TEXT;
