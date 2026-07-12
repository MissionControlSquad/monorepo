# Epic #13 — Observability dashboard

**Phase:** 6 (Polish) · **Gap:** 🟢 Low (read-only aggregation over existing entities) · **Dependencies:**
#1 (tenancy), #4 (CostEvent + BudgetIncident), approvals, tasks, agents. **No new tables.**

Ports Paperclip's `services/dashboard.ts` (`dashboardService.summary`): a single workspace-scoped
observability summary — agent status rollup, task status rollup, pending approvals, month-to-date
spend, and active budget incidents.

## 0. Decisions / deviations
- **D1** — `companyId` → `workspaceId`. Read-only; no schema, no migration.
- **D2 (scope-out — run activity)** — Paperclip's `runActivity` (per-day heartbeat-run breakdown with a
  recursive retry-chain recovery CTE) has **no data source** in the monorepo (no `heartbeatRuns`
  table). Dropped from v1; documented here so it is a deliberate omission, not an oversight. Everything
  else in `summary` maps to existing tables.
- **D3 (parity delta — agent buckets)** — the monorepo `AgentStatus` enum is `{idle, active, blocked}`
  (no `running/paused/error`). We bucket faithfully: `operational = idle + active`, `blocked`, plus
  raw `idle`/`active` and `total`. Paperclip's `paused/error` have no equivalent status here.
- **D4 (parity delta — costs)** — the monorepo has no workspace-level `budgetMonthlyCents`; budgets are
  per-agent `BudgetPolicy` (#4). So we report `monthSpendCents` (MTD from `CostEvent.amountCents`) +
  `activeBudgetIncidents` (open `BudgetIncident`s) instead of a workspace utilization %.
- **D5 (task scoping)** — `Task` has no `workspaceId` in this codebase; tasks attach to a `Project`
  (which does). The task rollup counts tasks via `project.workspaceId`; projectless tasks belong to no
  workspace and are excluded. Agents/approvals/cost-events/incidents all carry `workspaceId` directly.

## 1. Requirements
- **R1.** `getWorkspaceSummary(workspaceId)` returns `{ agents, tasks, costs, pendingApprovals,
  activeBudgetIncidents }`.
- **R2.** `agents`: `{ total, operational, blocked, idle, active }` from a `groupBy(status)` over
  `Agent` in the workspace (D3 bucketing).
- **R3.** `tasks`: `{ total, open, inProgress, review, blocked, done }` from a `groupBy(status)` over
  `Task`. `open = total − done` (all non-terminal, faithful to Paperclip's `status !== done`).
- **R4.** `costs.monthSpendCents` = `sum(CostEvent.amountCents)` where `occurredAt >= UTC month start`.
- **R5.** `pendingApprovals` = count of `Approval` with `status = pending`; `activeBudgetIncidents` =
  count of open `BudgetIncident` whose policy is in the workspace.
- **R6.** Gated by `requireFeature(FLAG_KEYS.OBSERVABILITY)`; workspace-isolated; `member` read.

## 2. Non-goals / guardrails
- **DO NOT** add a table or migration (read-only).
- **DO NOT** port `runActivity` (no `heartbeatRuns` source — D2).
- **DO NOT** leak cross-workspace counts (every aggregate is workspace-filtered).

## 3. Data model
None. Pure aggregation over `Agent`, `Task`, `Approval`, `CostEvent`, `BudgetIncident`/`BudgetPolicy`.

## 4-8. API / files
- **Flag** `FLAG_KEYS.OBSERVABILITY` (default true; startup seed).
- **Service** `services/observability.ts`: pure `bucketAgentCounts`, `bucketTaskCounts`,
  `getUtcMonthStart`; `getWorkspaceSummary(workspaceId)`.
- **GraphQL** `types/observability.ts` (simpleObjects `AgentSummary`, `TaskSummary`, `CostSummary`,
  `WorkspaceSummary`); query `workspaceSummary`.
- **UI** `/observability`: cards for agents (operational/blocked), tasks (open/in-progress/done),
  month spend, pending approvals, active incidents.

## 9. Implementation order
1. Flag + pure service + unit tests (no migration). 2. GraphQL + integration tests. 3. UI + client + nav.

## 10. Test cases
- Unit: `bucketAgentCounts` (idle+active→operational, blocked separate, total); `bucketTaskCounts`
  (open = non-done superset, done/blocked/review/inProgress split); `getUtcMonthStart` (UTC boundary).
- Integration: summary reflects seeded agents/tasks/approvals; month spend counts only this-month
  CostEvents (a last-month event excluded); active incident counted, resolved excluded; isolation
  (WS_A summary ignores WS_B rows); gate (OBSERVABILITY off → error).

## 11. Definition of Done
A workspace-scoped summary faithful to Paperclip (minus run-activity), pure bucketers unit-tested,
month-spend window + incident/approval counts correct + workspace-isolated; gated by OBSERVABILITY +
role; unit+integration green.

## 12. Risks
- **Month boundary** → `getUtcMonthStart` computes a UTC month start; unit-tested at the boundary.
- **Cross-workspace incident leak** → incidents are filtered by their policy's `workspaceId`.
- **Status enum drift** → bucketers switch on known values and sum unknowns into `total` only.
