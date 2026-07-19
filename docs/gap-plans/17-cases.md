# Epic #17 — Cases domain

**Phase:** 3 (Autonomy) · **Gap:** 🟠 Medium (new bounded domain) · **Dependencies:** #1 (buildbase
tenancy → `ctx.tenancy`, `requireRole`, `scoped`), reuses `Document` (docs/attachments) + `Task`
(case↔task links) + the `Activity`/append-only-log convention (case events).

Ports Paperclip's first-class **Case** entity (a support-ticket / work-item with a hierarchy, custom
fields, a status lifecycle, labels, task links, and an append-only event timeline) — distinct from
the pipeline-stage `PipelineCase` (Epic #7). Grounded in Paperclip `schema/cases.ts` + migration
`0143_cases_foundation.sql`.

## 0. Decisions-in-force
- **D5 — Workspace scoping.** Every root row carries `workspaceId String` (buildbase `_id`, no FK,
  `@@index`). Reads via `scoped(ctx, where)`; mutations via `requireRole(ctx, min)`.
- **Rename to avoid collision.** Paperclip's `status` text-enum → Prisma enum **`CaseState`** (NOT
  `CaseStatus`, which Epic #7 already owns). Model is **`Case`** (free; `PipelineCase` is separate).
- **Reuse, don't reinvent.** Case documents/attachments reuse the existing **`Document`** model
  (title/content/storageKey/fileName/mimeType/fileSize) via a `CaseDocument` join + slot key — no
  `assets` table. Case↔task uses **`Task`** (Paperclip's "issues").

## 1. Requirements
- **R1.** Admin/member create a `Case` (workspace-scoped): `title`, `caseType`, optional `summary`,
  `projectId`, `parentCaseId`, `key` (dedup within `(workspace, caseType)`), `fields` (Json). Auto
  `caseNumber` (autoincrement) + `identifier` (`CASE-<n>`). Status defaults `draft`.
- **R2.** Status lifecycle `draft → in_progress → in_review → approved → done | cancelled`; any→any
  is allowed (no enforced graph, matches source), but `done`/`cancelled` stamps `completedAt` and
  any other status clears it. Every status change appends a `status_changed` `CaseEvent`.
- **R3.** Update mutable fields (`title`, `summary`, `fields`, `caseType`) → appends `updated` /
  `fields_changed` events.
- **R4.** Link/unlink a `Task` to a case with `role ∈ {origin, work, reference}`; unique per
  `(case, task)`. Emits `task_linked`/`task_unlinked`. Reverse lookup `casesForTask(taskId)`.
- **R5.** Labels: a workspace `Label` catalog (`name` unique per workspace, `color`); add/remove a
  label on a case (`CaseLabel`, unique per `(case,label)`). Emits `label_added`/`label_removed`.
- **R6.** Attach a `Document` to a case under a slot `key` (`CaseDocument`, unique `(case,key)` and
  `(document)`); emits `document_attached`.
- **R7.** Case hierarchy via `parentCaseId` (self-relation); child creation emits `child_linked` on
  the parent.
- **R8.** `caseEvents(caseId)` returns the append-only timeline (newest first).
- **R9.** Every read/list is workspace-isolated (proven by test). Every query + mutation gated by
  `requireFeature(FLAG_KEYS.CASES)`; mutations additionally `requireRole(ctx,'member')` (create/work)
  — label-catalog + delete are `admin`.

## 2. Non-goals / guardrails
- **DO NOT** conflate with `PipelineCase` (Epic #7): separate tables/enums, no cross-reads.
- **DO NOT** add binary-attachment metadata columns — reuse `Document` (has storageKey/mime/size).
- **DO NOT** model comments here — Paperclip uses polymorphic document annotations; **deferred**.
- **DO NOT** add a priority/assignee (source cases have neither; assignment lives on linked tasks).
- **DO NOT** FK `workspaceId`; `projectId`/`parentCaseId` are nullable `SetNull`/`SetNull` relations.

## 3. Data model — `packages/database/prisma/schema/case.prisma`
```prisma
enum CaseState { draft in_progress in_review approved done cancelled }
enum CaseTaskRole { origin work reference }
enum CaseEventKind { created updated status_changed fields_changed task_linked task_unlinked document_attached label_added label_removed child_linked }

model Case { id, workspaceId, projectId?, caseNumber @default(autoincrement) @unique, identifier @unique,
  caseType, key?, title, summary?, status CaseState @default(draft), fields Json @default("{}"),
  parentCaseId?, createdByProfileId?, completedAt?, createdAt, updatedAt;
  project?, parentCase(self), childCases, createdByProfile, taskLinks, events, documents, labels;
  @@unique([workspaceId, caseType, key]); @@index([workspaceId]); @@index([workspaceId, status]);
  @@index([workspaceId, caseType]); @@index([parentCaseId]); @@map("cases") }
model CaseTaskLink { id, workspaceId, caseId, taskId, role, createdAt; @@unique([caseId, taskId]); @@map("case_task_links") }
model CaseEvent { id, workspaceId, caseId, kind, actorType, actorProfileId?, payload Json?, createdAt; @@index([caseId, createdAt]); @@map("case_events") }
model CaseDocument { id, workspaceId, caseId, documentId, key, createdAt, updatedAt; @@unique([caseId, key]); @@unique([documentId]); @@map("case_documents") }
model Label { id, workspaceId, name, color, createdAt, updatedAt; @@unique([workspaceId, name]); @@map("labels") }
model CaseLabel { id, workspaceId, caseId, labelId, createdAt; @@unique([caseId, labelId]); @@map("case_labels") }
```
Edits: `Task += caseLinks`; `Document += caseDocument CaseDocument?`; `Project += cases`; `Profile += createdCases`.

## 4-8. API / migration / files
- **Flag** `FLAG_KEYS.CASES` (default true; startup seed). Migration `add_cases`: 6 tables + 3 enums,
  no backfill.
- **Service** `services/cases.ts` (createCase + nextIdentity, updateCase, setStatus w/ completedAt,
  linkTask/unlinkTask, addLabel/removeLabel + catalog, attachDocument, appendEvent) — every mutation
  funnels through `appendCaseEvent`.
- **GraphQL** `types/case.ts` (Case/CaseTaskLink/CaseEvent/CaseDocument/Label prismaObjects); queries
  `cases`/`case`/`caseEvents`/`casesForTask`/`labels`; mutations `createCase`, `updateCase`,
  `setCaseStatus`, `linkTaskToCase`, `unlinkTaskFromCase`, `addCaseLabel`, `removeCaseLabel`,
  `createLabel`, `attachCaseDocument`. No REST (human + agent both via GraphQL; agent case writes are
  a future slice).
- **UI** `/cases` (list + create + status + labels + task links + event timeline).

## 9. Implementation order
1. Schema + back-relations + migration + `CASES` flag. 2. `services/cases.ts` + pure helpers +
unit tests. 3. GraphQL types/queries/mutations + integration tests. 4. `/cases` UI + client.

## 10. Test cases
- Unit: `caseIdentifier(n)` format; `completedAtForStatus` (done/cancelled set, others clear);
  status-transition helper.
- Integration: create stamps number+identifier+`created` event; setStatus done stamps completedAt +
  `status_changed`; link task (role) unique + `task_linked`; label add/remove + catalog unique;
  attach document (slot unique) + `document_attached`; child case → `child_linked` on parent;
  workspace isolation (list/update NOT_FOUND across ws); feature gate.

## 11. Definition of Done
Schema migrates additively; create → number/identifier/event; status lifecycle + completedAt; task
links w/ role + reverse lookup; labels catalog + join; document attach; hierarchy; append-only events;
workspace isolation proven; all gated by `CASES` + role; unit+integration green.

## 12. Risks
- **Enum/name collision with #7** → `Case`/`CaseState` (distinct from `PipelineCase`/`CaseStatus`);
  reviewers verify no cross-import.
- **Identifier uniqueness** → `caseNumber` autoincrement + `identifier` unique.
- **Event completeness** → centralize in `appendCaseEvent` so no mutation path skips the timeline.
