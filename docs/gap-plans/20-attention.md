# Epic #20 — Attention feed

**Phase:** 6 (Polish) · **Gap:** 🟢 Low (read-only aggregation) · **Dependencies:** #1, #3 (approvals),
#4 (budget incidents), #19 (org-chain health), tasks. **No new tables.**

Closes the attention-feed gap: Paperclip has a unified "what needs your attention now" feed
(`AttentionFeed`) that ranks items from many sources by severity. AgentCenter surfaced these signals
only piecemeal (a badge here, a page there). This epic computes one ranked, severity-tagged feed over
the entities that already exist. Grounded in Paperclip `packages/shared/src/types/attention.ts`
(`AttentionSourceKind`, `AttentionSeverity`, `AttentionFeed`).

## 0. Decisions / deviations
- **D1** — read-only; no schema, no migration. `companyId` → `workspaceId`.
- **D2 (sources — the subset that has data here)** — v1 aggregates the four sources with real
  monorepo backing:
  - `approval` — pending `Approval`s (severity `high`).
  - `budget_alert` — open `BudgetIncident`s (`hard` → `critical`, `soft` → `high`).
  - `blocker_attention` — `blocked` `Task`s (severity `medium`), scoped via `project.workspaceId`.
  - `agent_error_alert` — agents whose org chain is invalid (cycle / missing_manager, via #19)
    (severity `high`).
  Paperclip's other sources (`failed_run`, `join_request`, `productivity_review`,
  `issue_thread_interaction`, `recovery_action`) have no monorepo data source and are omitted — a
  documented subset, not an oversight.
- **D3 (no dismissals)** — Paperclip persists per-item dismissals (`attention_dismissals`). v1 computes
  the live feed only; a dismissal layer is a documented follow-up (it needs a small table).
- **D4 (ranking)** — pure `rankAndCount`: items sort by severity (`critical`>`high`>`medium`>`low`) then
  recency (`activityAt` desc); the feed carries `totalCount` + `countsBySourceKind`.

## 1. Requirements
- **R1.** `getAttentionFeed(workspaceId)` → `{ totalCount, countsBySourceKind, items[] }`.
- **R2.** Each item: `{ id, sourceKind, severity, subjectKind, subjectId, title, whyNow, activityAt }`.
- **R3.** Pure `severityRank(sev)` and `rankAndCount(items)` (sort + counts) — unit-tested.
- **R4.** Gated by `requireFeature(FLAG_KEYS.ATTENTION)`, workspace-isolated, `member` read.

## 2. Non-goals / guardrails
- **DO NOT** add a table (read-only, D1).
- **DO NOT** invent sources without data (D2) — omit, don't fabricate.
- **DO NOT** persist dismissals in v1 (D3).
- **DO NOT** leak cross-workspace items (every source query is workspace-filtered).

## 3. Data model
None. Aggregates `Approval`, `BudgetIncident`, `Task` (via `project.workspaceId`), and `Agent` org-chain
health (#19).

## 4-8. API / files
- **Flag** `FLAG_KEYS.ATTENTION` (default true; startup seed).
- **Service** `services/attention.ts`: pure `severityRank`, `rankAndCount`; `getAttentionFeed`.
- **GraphQL** `types` inline: `AttentionItem` + `AttentionFeed` simpleObjects; query `attentionFeed`.
- **UI** `/attention`: ranked list, severity badge per item, source label, deep-link to the owning
  screen (approvals / finance / reliability / org-chart).

## 9. Implementation order
1. Flag + pure service + unit tests (no migration). 2. GraphQL + integration tests. 3. UI + client + nav.

## 10. Test cases
- Unit: `severityRank` ordering; `rankAndCount` (sorts critical→low then recent-first; counts by
  source; totalCount).
- Integration: a pending approval, an open hard incident, a blocked task, and a cyclic org chain each
  produce exactly one correctly-typed item; a `critical` incident outranks a `medium` blocker;
  resolved/closed items are excluded; workspace isolation; gate.

## 11. Definition of Done
One ranked, severity-tagged attention feed over approvals + budget incidents + blocked tasks + broken
org chains, workspace-scoped; ranking pure + unit-tested; sources without data omitted; dismissals
deferred; gated by ATTENTION + role; unit+integration green.

## 12. Risks
- **Fabricated/empty sources** → only sources with real data are included (D2).
- **Cross-workspace leak** → each source query is workspace-filtered (tasks via their project).
- **Unbounded feed** → each source is naturally bounded (open/pending/blocked only); items carry a
  stable `id` for the UI.
