-- Parity §3.12: add the `backlog` task status (Paperclip has it), ordered before `inbox` so the
-- board/kanban surface it first. Additive enum value; no rows change status. Idempotent guard.
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'backlog' BEFORE 'inbox';
