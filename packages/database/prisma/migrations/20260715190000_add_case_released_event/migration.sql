-- Add the 'released' case-event type (un-claim a pipeline case back to open).
ALTER TYPE "PipelineCaseEventType" ADD VALUE IF NOT EXISTS 'released';
