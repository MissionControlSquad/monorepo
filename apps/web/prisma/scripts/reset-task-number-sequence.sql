-- Reset the task number sequence so the next created task gets #1.
-- Use this after deleting all tasks if you want to start numbering from 1 again.
-- PostgreSQL only (sequence name from Prisma SERIAL on tasks.taskNumber).

ALTER SEQUENCE "tasks_taskNumber_seq" RESTART WITH 1;
