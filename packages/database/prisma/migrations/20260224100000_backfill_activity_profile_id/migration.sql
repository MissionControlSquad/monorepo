-- Backfill activities.profileId for records that are currently NULL.
-- This resolves the gap where human/dashboard actions did not set profileId.

-- 1. task_created: use the task's createdByProfileId
UPDATE "activities" a
SET "profileId" = t."createdByProfileId"
FROM "tasks" t
WHERE a."profileId" IS NULL
  AND a."type" = 'task_created'
  AND a."taskId" = t."id"
  AND t."createdByProfileId" IS NOT NULL;

-- 2. message_sent: match activity to the most recent message on the same task
--    created within 5 seconds of the activity
UPDATE "activities" a
SET "profileId" = sub."fromProfileId"
FROM (
  SELECT DISTINCT ON (a2."id")
    a2."id" AS activity_id,
    m."fromProfileId"
  FROM "activities" a2
  JOIN "messages" m ON m."taskId" = a2."taskId"
  WHERE a2."profileId" IS NULL
    AND a2."type" = 'message_sent'
    AND a2."taskId" IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (m."createdAt" - a2."createdAt"))) < 5
  ORDER BY a2."id", ABS(EXTRACT(EPOCH FROM (m."createdAt" - a2."createdAt")))
) sub
WHERE a."id" = sub.activity_id;

-- 3. task_assigned / task_updated / task_completed: use the task's createdByProfileId
--    as a best-effort fallback (the person who created the task likely manages it)
UPDATE "activities" a
SET "profileId" = t."createdByProfileId"
FROM "tasks" t
WHERE a."profileId" IS NULL
  AND a."type" IN ('task_assigned', 'task_updated', 'task_completed')
  AND a."taskId" = t."id"
  AND t."createdByProfileId" IS NOT NULL;
