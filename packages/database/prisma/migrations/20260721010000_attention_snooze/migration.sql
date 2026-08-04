-- Paperclip parity (inbox-dismissals snooze): a dismissal can expire, re-surfacing the item.
ALTER TABLE "attention_dismissals" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
