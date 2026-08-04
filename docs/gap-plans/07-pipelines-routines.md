# Epic #7 — Pipelines / Routines

**Phase:** 3 (Autonomy) · **Gap:** 🟠 Medium
**Dependencies:** #1 (Organization / OrgRole / `require-role.ts`), plus the existing recurring-task + cron infrastructure.

AgentCenter today has only `RecurringTask` (blueprint + cron-style `recurrenceConfig`) and lazy
generation via `generateRecurringTasks()`. Paperclip splits into two concepts we port: **Routines**
(a reusable scheduled/triggered workflow doc with run history, revisions, and a public fire URL)
and **Pipelines** (multi-stage workflows with **cases** that claim/transition/breakdown through
stages, a review-cases inbox, and health/liveness).

---

## Target model
```
Routine (org-scoped reusable workflow doc)
 ├─ definition: Json           (steps / instructions the run executes)
 ├─ RoutineTrigger[]           (cron | manual | public webhook w/ publicId)
 │    └─ publicId (nanoid)     → POST /api/routines/fire/:publicId
 ├─ RoutineRevision[]          (immutable snapshots of definition)
 └─ RoutineRun[]               (history: queued→running→succeeded/failed)
        └─ generatedTaskId?    → Task

Pipeline (org/project-scoped multi-stage workflow)
 ├─ PipelineStage[]            (ordered; isReviewStage flag → review inbox)
 └─ PipelineCase[]            (an item flowing through stages)
        ├─ status: CaseStatus  (open|claimed|in_review|transitioned|done|rejected)
        ├─ currentStageId → PipelineStage
        ├─ claimedByProfileId
        ├─ linkedTaskId? → Task   (case ⇄ task link, breakdown target)
        └─ PipelineCaseEvent[] (append-only)
```

## Schema changes — `packages/database/prisma/schema/pipeline.prisma`
```prisma
// ─── Routines ──────────────────────────────────────────────────────
enum RoutineTriggerType { cron manual webhook }
enum RoutineRunStatus { queued running succeeded failed cancelled }

model Routine {
  id                 String   @id @default(cuid())
  organizationId     String
  name               String
  description        String?
  definition         Json
  isActive           Boolean  @default(true)
  timezone           String   @default("UTC")
  createdByProfileId String?
  projectId          String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdByProfile Profile?          @relation("RoutineCreatedByProfile", fields: [createdByProfileId], references: [id], onDelete: SetNull)
  project          Project?          @relation(fields: [projectId], references: [id], onDelete: SetNull)
  triggers         RoutineTrigger[]
  revisions        RoutineRevision[]
  runs             RoutineRun[]

  @@index([organizationId])
  @@index([isActive])
  @@index([projectId])
  @@map("routines")
}

model RoutineTrigger {
  id               String             @id @default(cuid())
  routineId        String
  type             RoutineTriggerType
  recurrenceConfig Json?                                  // reuses RecurringTask.recurrenceConfig shape (cron)
  nextFireAt       DateTime?
  publicId         String?            @unique             // nanoid; public fire URL (webhook)
  isEnabled        Boolean            @default(true)
  createdAt        DateTime           @default(now())

  routine Routine @relation(fields: [routineId], references: [id], onDelete: Cascade)

  @@index([routineId])
  @@index([type, isEnabled, nextFireAt])                  // cron scan predicate
  @@index([publicId])
  @@map("routine_triggers")
}

model RoutineRevision {
  id          String   @id @default(cuid())
  routineId   String
  version     Int
  definition  Json
  editedById  String?
  createdAt   DateTime @default(now())

  routine  Routine  @relation(fields: [routineId], references: [id], onDelete: Cascade)
  editedBy Profile? @relation("RoutineRevisionEditedBy", fields: [editedById], references: [id], onDelete: SetNull)

  @@unique([routineId, version])
  @@index([routineId, createdAt])
  @@map("routine_revisions")
}

model RoutineRun {
  id              String           @id @default(cuid())
  routineId       String
  triggeredBy     RoutineTriggerType
  triggerId       String?
  status          RoutineRunStatus @default(queued)
  startedAt       DateTime?
  finishedAt      DateTime?
  error           String?
  output          Json?
  generatedTaskId String?
  createdAt       DateTime         @default(now())

  routine       Routine @relation(fields: [routineId], references: [id], onDelete: Cascade)
  generatedTask Task?   @relation("TaskFromRoutineRun", fields: [generatedTaskId], references: [id], onDelete: SetNull)

  @@index([routineId, createdAt])
  @@index([status])
  @@map("routine_runs")
}

// ─── Pipelines ─────────────────────────────────────────────────────
enum CaseStatus { open claimed in_review transitioned done rejected }
enum PipelineCaseEventType { created claimed transitioned commented breakdown rejected linked_task }

model Pipeline {
  id             String   @id @default(cuid())
  organizationId String
  projectId      String?
  name           String
  description    String?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  project      Project?        @relation(fields: [projectId], references: [id], onDelete: SetNull)
  stages       PipelineStage[]
  cases        PipelineCase[]

  @@index([organizationId])
  @@index([projectId])
  @@map("pipelines")
}

model PipelineStage {
  id            String  @id @default(cuid())
  pipelineId    String
  name          String
  order         Int
  isReviewStage Boolean @default(false)                  // surfaces cases in review-cases inbox
  slaMinutes    Int?                                     // liveness/health: stage SLA

  pipeline     Pipeline       @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  casesAtStage PipelineCase[] @relation("CaseCurrentStage")

  @@unique([pipelineId, order])
  @@index([pipelineId])
  @@map("pipeline_stages")
}

model PipelineCase {
  id                 String     @id @default(cuid())
  pipelineId         String
  currentStageId     String?
  title              String
  payload            Json?
  status             CaseStatus @default(open)
  claimedByProfileId String?
  claimedAt          DateTime?
  linkedTaskId       String?
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt
  enteredStageAt     DateTime   @default(now())

  pipeline     Pipeline           @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  currentStage PipelineStage?     @relation("CaseCurrentStage", fields: [currentStageId], references: [id], onDelete: SetNull)
  claimedBy    Profile?           @relation("PipelineCaseClaimedBy", fields: [claimedByProfileId], references: [id], onDelete: SetNull)
  linkedTask   Task?              @relation("TaskFromPipelineCase", fields: [linkedTaskId], references: [id], onDelete: SetNull)
  events       PipelineCaseEvent[]

  @@index([pipelineId, status])
  @@index([currentStageId, status])
  @@index([claimedByProfileId])
  @@index([enteredStageAt])
  @@map("pipeline_cases")
}

model PipelineCaseEvent {
  id             String                @id @default(cuid())
  caseId         String
  type           PipelineCaseEventType
  fromStageId    String?
  toStageId      String?
  actorProfileId String?
  note           String?
  metadata       Json?
  createdAt      DateTime              @default(now())

  case PipelineCase @relation(fields: [caseId], references: [id], onDelete: Cascade)

  @@index([caseId, createdAt])
  @@map("pipeline_case_events")
}
```
Edits: `task.prisma` back-relations `routineRuns`/`pipelineCases`; `project.prisma` + `organization.prisma` add `routines`/`pipelines`.

## Reuse analysis (don't reinvent)
- **Cron scheduling math — reuse verbatim.** `recurring-tasks.ts` already has timezone-correct `validateRecurrenceConfig`, `calculateInitialDueDate`, `calculateNextDueDate` (DST-aware `applyTime`). `RoutineTrigger.recurrenceConfig` reuses the same JSON shape → these apply unchanged.
- **Cron route pattern — extend.** New `api/cron/routines/route.ts` copies the Bearer-`CRON_SECRET` guard from `api/cron/auto-sleep/route.ts`.
- **`RecurringTask`/`triggerRecurringTaskNow`** are the templates. `Routine` is **genuinely new** (adds run history, revisions, multi-trigger fan-out that would overload `RecurringTask`'s blueprint semantics).
- **Task linking — reuse.** `PipelineCase.linkedTaskId`/`RoutineRun.generatedTaskId` reuse `Task` + `taskModel.create`/`emitCreated` (the path `generateRecurringTasks` uses); breakdown reuses `Task.parentTaskId`.
- **Events — reuse `events/bus.ts` + `pubsub`.** New `EventTypes` in `packages/utils/src/domain-constants.ts`.
- **Genuinely new:** `Pipeline`/`PipelineStage`/`PipelineCase`/`PipelineCaseEvent` — no staged-workflow concept; append-only `PipelineCaseEvent` follows the `StatusHistory`/`ProjectDocRevision` audit convention.

## GraphQL / REST / Backend / UI
- **GraphQL:** `routine.ts` (Routine/Trigger/Revision/Run) — queries `routines`, `routine`, `routineRuns`; mutations `createRoutine`, `updateRoutine` (snapshots revision), `addRoutineTrigger`, `triggerRoutineNow`, `regenerateRoutineWebhookId`. `pipeline.ts` — queries `pipelines`, `pipeline`, `reviewCases`, `pipelineHealth`; mutations `createPipeline`, `addPipelineStage`, `createCase`, `claimCase`, `transitionCase`, `breakdownCase`, `rejectCase`. Subscriptions `caseUpdated`, `routineRunUpdated`.
- **REST:** `api/routines/route.ts` + `[id]` (mirror `api/recurring-tasks/`); `api/routines/fire/[publicId]/route.ts` (public, rate-limited); `api/cron/routines/route.ts` (CRON_SECRET); `api/pipelines/**`.
- **Backend:** `routines.ts` (port of `recurring-tasks.ts`, reuse recurrence helpers verbatim; `enqueueRoutineRun`/`executeRoutineRun`/`triggerRoutineNow`); `pipelines.ts` (`claimCase` conditional update, `transitionCase` validates order + appends event, `breakdownCase`, `computePipelineHealth`). Emit through `events/bus.ts`.
- **UI:** `routines/` (list, cron editor reusing the recurrence editor, public-fire-URL panel, run history, revision diff); `pipelines/` (stage Kanban, case drawer claim/transition/breakdown, `pipelines/review/` inbox, health badges). Mobile read-only run history + review inbox.

## Feature-flag + license
- Flag `pipelines_routines` via `isFeatureEnabled` (double-gated). License feature string `pipelines` on pro/enterprise. Public fire URL additionally requires the flag at request time.

## Migration script (end-to-end)
```bash
cd packages/database
pnpm db:migrate --name add_pipelines_routines
#   → CREATE TABLE routines, routine_triggers, routine_revisions, routine_runs,
#     pipelines, pipeline_stages, pipeline_cases, pipeline_case_events + enums.

# No backfill: every table is new; existing rows unaffected. Back-relation arrays on
# tasks/projects/organizations are virtual in Prisma and emit no SQL.

pnpm db:seed          # inserts flag key "pipelines_routines" (idempotent)
pnpm db:migrate:deploy
```
**Rollback:** `prisma migrate resolve --rolled-back <ts>_add_pipelines_routines` then drop the eight tables + four enums (safe — nothing else references them). Zero-downtime since nothing reads these until the flag is enabled.

## Test cases
**Unit (`apps/web/tests/unit`, `vitest.unit-no-db.config.ts`):**
- `routines.spec.ts` — reuse-coverage of `calculateNextDueDate` for cron config (daily/weekly/monthly, DST boundary); `advanceNextFireAt` skips missed fires.
- `pipeline-transition.spec.ts` — `transitionCase` rejects transition to lower/equal `order`; accepts strictly increasing (pure validator, no DB).
- `webhook-publicId.spec.ts` — `publicId` generation unique + URL-safe.

**Integration (GraphQL + DB, `vitest.config.ts`):**
- `routine-run.int.spec.ts` — `triggerRoutineNow` creates a `RoutineRun` (queued→running→succeeded) and a linked `Task` with `generatedTaskId` set.
- `routine-revision.int.spec.ts` — `updateRoutine` snapshots a new `RoutineRevision` with `version+1`; unique holds.
- `review-inbox.int.spec.ts` — `reviewCases` returns only cases on `isReviewStage` stages.
- `pipeline-health.int.spec.ts` — case older than `slaMinutes` since `enteredStageAt` appears in `pipelineHealth`.
- **Concurrency:** `case-claim-race.int.spec.ts` — two concurrent `claimCase` on the same `open` case → exactly one succeeds; the other errors "already claimed" (guarded by conditional `UPDATE ... WHERE status='open'`).
- **Ordering:** `case-stage-order.int.spec.ts` — `createCase → claim → transition(stage1) → transition(stage2) → done` passes stages strictly in order, one `PipelineCaseEvent` per step.

**E2E (`apps/web/tests/e2e`):** `pipelines.e2e.ts` — cron route fires a due trigger; public `POST /api/routines/fire/:publicId` enqueues a run; review-inbox claim + transition via dashboard.

## Best-approach confirmation
Modeling `Routine` as a first-class entity (with `RoutineRun`/`RoutineRevision`) rather than
overloading `RecurringTask` is correct: `RecurringTask` is a task blueprint whose only output is a
`Task`, whereas a routine needs run history, revisions, and multiple heterogeneous triggers — cramming
those into `RecurringTask` would fork its cron/generation semantics. Reusing the proven
`recurrenceConfig` shape and cron-route guard keeps scheduling risk near zero. For pipelines, an
append-only `PipelineCaseEvent` log (following `StatusHistory`) was chosen over mutating in-place so
case history is auditable; **rejected:** storing stage history as a JSON array on the case (loses
per-event indexing and query-by-stage).

## Acceptance checklist
- [ ] Cron trigger fires a `RoutineRun` at `nextFireAt`; `nextFireAt` advances via `calculateNextDueDate`.
- [ ] Public fire URL enqueues a run without a session and is rate-limited.
- [ ] Editing a routine definition creates an immutable `RoutineRevision` with incremented `version`.
- [ ] Run history shows queued→running→succeeded/failed with error text on failure.
- [ ] A case claims atomically, transitions only to higher-`order` stages, and each action appends a `PipelineCaseEvent`.
- [ ] Review-cases inbox lists exactly the cases on `isReviewStage` stages.
- [ ] `breakdownCase` creates a linked `Task` and sets `linkedTaskId`.
- [ ] `pipelineHealth` flags cases exceeding `slaMinutes`.
- [ ] Feature hidden when flag off or license lacks `pipelines`.

## Risks
- Routine `definition` is opaque JSON — needs a runtime Zod validator + versioned migration story.
- Public fire URL is unauthenticated ingress: rate-limit, HMAC, per-trigger enable; leaked `publicId` should be rotatable.
- Stage reordering vs `@@unique([pipelineId, order])` requires transactional renumbering.
- Liveness cron + subscription fan-out can be chatty on large pipelines; scope scans by `[status, updatedAt]` and batch.
