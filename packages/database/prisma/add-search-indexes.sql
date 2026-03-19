-- GIN indexes for PostgreSQL full-text search on searched columns
-- Run with: npx prisma db execute --stdin < prisma/add-search-indexes.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_title_search
  ON tasks USING GIN (to_tsvector('english', title));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_description_search
  ON tasks USING GIN (to_tsvector('english', description));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_content_search
  ON messages USING GIN (to_tsvector('english', content));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliverables_title_search
  ON deliverables USING GIN (to_tsvector('english', title));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliverables_content_search
  ON deliverables USING GIN (to_tsvector('english', coalesce(content, '')));
