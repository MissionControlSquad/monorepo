-- Domain 8 G6.7: cancelled task status + cancelledAt timestamp.
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TABLE "tasks" ADD COLUMN "cancelledAt" TIMESTAMP(3);
