# Epic #19 — Org chart (agent reporting hierarchy)

**Phase:** 3 (Agent structure) · **Gap:** 🟡 Medium (closes the "company of agents" structural gap) ·
**Dependencies:** #1 (tenancy), `Agent`.

Closes the org-chart gap: Paperclip models agents as a **reporting hierarchy** (`agents.reports_to`) and
computes **org-chain health** (`getAgentOrgChainHealth`) that gates work eligibility. AgentCenter had no
hierarchy at all. This epic ports the reporting edge + the org-chain integrity algorithm + the tree
view. Grounded in Paperclip `packages/shared/src/agent-eligibility.ts` and the `org-chart-svg` route.

## 0. Decisions / deviations
- **D1 (column, not table)** — the hierarchy is one self-referencing column on the existing `Agent`:
  `reportsToAgentId String?` (self-FK, `onDelete: SetNull` — a deleted manager re-roots reports).
- **D2 (health checks — cycle + missing)** — `getAgentOrgChainHealth` is ported for the two structural
  failure modes that map here: **cycle** (a report chain loops) and **missing_manager** (`reportsTo`
  points at an agent absent from the workspace). Paperclip's third mode, **terminated ancestor**, has
  **no monorepo equivalent** (its `AgentStatus` is `idle|active|blocked`, no `terminated`); dropped, not
  overlooked.
- **D3 (cycle guard on write)** — `setAgentReportsTo` rejects a manager assignment that would create a
  cycle (walks ancestors), matching the goals-tree guard from #11. Cross-workspace managers rejected.
- **D4 (SVG deferred)** — Paperclip renders a themed SVG org chart server-side (`org-chart-svg`, ~780
  lines, sharp/PNG). We render an indented HTML tree in the UI instead; the SVG/PNG export is out of
  scope.

## 1. Requirements
- **R1.** `Agent.reportsToAgentId` (nullable self-FK) — the manager edge. A root has `null`.
- **R2.** `setAgentReportsTo(workspaceId, agentId, reportsToAgentId|null)`: both agents must be in the
  workspace; the assignment must not create a cycle; else `BAD_USER_INPUT`.
- **R3.** `getOrgChartAgents(workspaceId)` returns the workspace's agents (id/name/role/status/
  reportsToAgentId); the pure `buildOrgTree` assembles the nested tree (roots + children).
- **R4.** Pure `getAgentOrgChainHealth({agent, agents})` → `{ status, reason, chain }` (healthy |
  invalid_org_chain with `cycle`/`missing_manager`); pure `assertNoReportingCycle`, `buildOrgTree`.
- **R5.** Gated by `requireFeature(FLAG_KEYS.ORG_CHART)`, workspace-isolated, `member` (org edits are
  configuration).

## 2. Non-goals / guardrails
- **DO NOT** add a table (the edge is a column) or a second hierarchy.
- **DO NOT** allow a cross-workspace `reportsTo` or a cycle (D3).
- **DO NOT** render/serve an SVG/PNG chart in v1 (D4).

## 3. Data model — `packages/database/prisma/schema/agent.prisma` (edit)
```prisma
model Agent {
  // …existing…
  reportsToAgentId String?
  reportsTo        Agent?  @relation("AgentOrg", fields: [reportsToAgentId], references: [id], onDelete: SetNull)
  reports          Agent[] @relation("AgentOrg")
  @@index([workspaceId, reportsToAgentId])
}
```

## 4-8. API / files
- **Flag** `FLAG_KEYS.ORG_CHART` (default true; startup seed). Migration `add_agent_reports_to`
  (1 column + FK + index).
- **Service** `services/org-chart.ts`: pure `getAgentOrgChainHealth`, `buildOrgTree`,
  `assertNoReportingCycle`; `setAgentReportsTo`, `getOrgChartAgents`.
- **GraphQL** expose `Agent.reportsToAgentId`; query `orgChart` (agents) + `agentOrgChainHealth(agentId)`
  (simpleObject); mutation `setAgentReportsTo(agentId, reportsToAgentId?)`.
- **UI** `/org-chart`: indented tree by `reportsTo`, per-agent manager picker, org-chain health badges.

## 9. Implementation order
1. Schema + flag. 2. Service + pure helpers + unit tests. 3. GraphQL + integration tests. 4. UI + client + nav.

## 10. Test cases
- Unit: `getAgentOrgChainHealth` (healthy chain; detects a cycle; detects a missing manager — ported);
  `assertNoReportingCycle` (rejects self + descendant manager); `buildOrgTree` (roots + nesting,
  orphans re-rooted).
- Integration: set a manager; clear it; a cycle assignment rejected; a cross-workspace manager rejected;
  `agentOrgChainHealth` returns cycle/missing correctly; `orgChart` is workspace-isolated; gate.

## 11. Definition of Done
Agents form a workspace-scoped reporting hierarchy with cycle/cross-workspace-safe edits + ported
org-chain health (cycle + missing_manager) + a tree view; SVG export deferred; gated by ORG_CHART +
role; unit+integration green.

## 12. Risks
- **Reporting cycle** → `assertNoReportingCycle` on write + `getAgentOrgChainHealth` detects any that
  slip in (e.g. via concurrent edits).
- **Dangling manager** → `SetNull` on delete + `missing_manager` health surfaces it in the UI.
- **Cross-workspace edge** → validated against a workspace-scoped fetch of both agents.
