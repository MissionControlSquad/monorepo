---
name: epic-spec-authoring
description: >
  How to write or update a docs/gap-plans/NN-*.md epic spec so a coding agent (Codex) can implement it
  with zero open design decisions. Use when authoring, upgrading, or reviewing an epic plan file.
---

# Epic spec authoring

Specs are for a coding AI that cannot ask questions. Self-contained, exact, testable. Full rulebook:
[`docs/gap-plans/CONVENTIONS.md`](../../../docs/gap-plans/CONVENTIONS.md).

## The 12 mandatory sections (in order)

1. **Header** — epic id · phase · hard dependencies · decisions-in-force (restate the D1–D5 that apply).
2. **Requirements** — numbered `R1, R2, …`, each a testable "the system MUST …".
3. **Non-goals / guardrails** — explicit "DO NOT …" list.
4. **Reuse map** — exact existing files/functions to use (path-precise; verify they exist).
5. **Data model** — exact Prisma (models/enums/indexes/relations; `workspaceId` no-FK; integer cents).
6. **Migration** — exact commands + idempotent backfill + rollback (per migration-safety).
7. **API contracts** — exact GraphQL SDL (types/queries/mutations/subscriptions with arg + return
   shapes) and REST signatures (method, path, request body, response body, auth, errors). If agents
   never need REST, say "REST — NONE (intentional)".
8. **File change list** — every file to create/modify, path-by-path, one-line "what goes here".
9. **Implementation order** — numbered steps (schema → migration → data access → resolvers → REST → UI
   → tests), each mapping to requirements.
10. **Test cases** — per requirement: name · type (unit/integration/e2e) · arrange · act · assert ·
    file path. Include cross-workspace isolation + concurrency where relevant.
11. **Definition of Done** — checklist, each item tied to a requirement, 100% green to ship.
12. **Risks** — with the mitigation baked into the plan.

## Rules

- Ground every path in the real code — read it; never guess a filename. A wrong reference is a bug that
  breaks the implementing agent.
- Restate the decisions (D1–D5) as they apply so the implementer never re-derives architecture.
- Money = integer cents. Tenancy column = `workspaceId` (no FK, indexed). Feature gate = buildbase slug.
- A spec missing any of the 12 sections is **not ready** — finish it before implementation starts.

## Self-check before publishing

- [ ] All 12 sections present and in order.
- [ ] Every requirement has ≥1 test case and a DoD line.
- [ ] Every cited file/function verified to exist.
- [ ] No stale pre-buildbase references (`Organization`, `OrgRole`, `require-role.ts` as a built store,
      `License.features` gating, `orgId` columns).
- [ ] Guardrails list the "do not touch agent auth / mc-bridge / human RBAC" boundaries.
