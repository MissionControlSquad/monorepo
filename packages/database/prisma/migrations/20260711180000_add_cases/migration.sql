-- Epic #17: Cases domain (support-ticket / work-item). 6 tables, 3 enums, no backfill.
-- workspaceId-scoped (no FK, D5). Reuses Document (case docs) + Task (case↔task links).

CREATE TYPE "CaseState" AS ENUM ('draft', 'in_progress', 'in_review', 'approved', 'done', 'cancelled');
CREATE TYPE "CaseTaskRole" AS ENUM ('origin', 'work', 'reference');
CREATE TYPE "CaseEventKind" AS ENUM ('created', 'updated', 'status_changed', 'fields_changed', 'task_linked', 'task_unlinked', 'document_attached', 'label_added', 'label_removed', 'child_linked');

CREATE TABLE "cases" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT,
  "caseNumber" SERIAL NOT NULL, "identifier" TEXT NOT NULL, "caseType" TEXT NOT NULL, "key" TEXT,
  "title" TEXT NOT NULL, "summary" TEXT, "status" "CaseState" NOT NULL DEFAULT 'draft',
  "fields" JSONB NOT NULL DEFAULT '{}', "parentCaseId" TEXT, "createdByProfileId" TEXT,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");
CREATE UNIQUE INDEX "cases_identifier_key" ON "cases"("identifier");
CREATE UNIQUE INDEX "cases_workspaceId_caseType_key_key" ON "cases"("workspaceId", "caseType", "key");
CREATE INDEX "cases_workspaceId_idx" ON "cases"("workspaceId");
CREATE INDEX "cases_workspaceId_status_idx" ON "cases"("workspaceId", "status");
CREATE INDEX "cases_workspaceId_caseType_idx" ON "cases"("workspaceId", "caseType");
CREATE INDEX "cases_parentCaseId_idx" ON "cases"("parentCaseId");

CREATE TABLE "case_task_links" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "taskId" TEXT NOT NULL,
  "role" "CaseTaskRole" NOT NULL DEFAULT 'work', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_task_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_task_links_caseId_taskId_key" ON "case_task_links"("caseId", "taskId");
CREATE INDEX "case_task_links_workspaceId_caseId_idx" ON "case_task_links"("workspaceId", "caseId");
CREATE INDEX "case_task_links_taskId_idx" ON "case_task_links"("taskId");

CREATE TABLE "case_events" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "kind" "CaseEventKind" NOT NULL,
  "actorType" TEXT NOT NULL, "actorProfileId" TEXT, "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_events_caseId_createdAt_idx" ON "case_events"("caseId", "createdAt");
CREATE INDEX "case_events_workspaceId_caseId_idx" ON "case_events"("workspaceId", "caseId");

CREATE TABLE "case_documents" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "key" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_documents_caseId_key_key" ON "case_documents"("caseId", "key");
CREATE UNIQUE INDEX "case_documents_documentId_key" ON "case_documents"("documentId");
CREATE INDEX "case_documents_workspaceId_caseId_idx" ON "case_documents"("workspaceId", "caseId");

CREATE TABLE "labels" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "labels_workspaceId_name_key" ON "labels"("workspaceId", "name");
CREATE INDEX "labels_workspaceId_idx" ON "labels"("workspaceId");

CREATE TABLE "case_labels" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "labelId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_labels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_labels_caseId_labelId_key" ON "case_labels"("caseId", "labelId");
CREATE INDEX "case_labels_workspaceId_caseId_idx" ON "case_labels"("workspaceId", "caseId");
CREATE INDEX "case_labels_labelId_idx" ON "case_labels"("labelId");

ALTER TABLE "cases" ADD CONSTRAINT "cases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cases" ADD CONSTRAINT "cases_parentCaseId_fkey" FOREIGN KEY ("parentCaseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cases" ADD CONSTRAINT "cases_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_task_links" ADD CONSTRAINT "case_task_links_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_task_links" ADD CONSTRAINT "case_task_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_labels" ADD CONSTRAINT "case_labels_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_labels" ADD CONSTRAINT "case_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
