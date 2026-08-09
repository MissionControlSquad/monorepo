---
name: production-implementation-loop
description: >
  The MANDATORY per-functionality and per-epic gate a coding agent (Codex) runs while implementing any
  AgentCenter epic — design + UI/UX + coding rules + tests + build check after EACH requirement, and a
  full gate before opening a PR. Use continuously during implementation. This is how we guarantee the
  build goes as planned and nothing lands broken.
---

# Production implementation loop

Implement **one requirement (Rn) at a time**. Never move to the next until the current one passes its
gate. Never batch multiple requirements and "test at the end." Real commands below (npm workspaces +
Turborepo; run from repo root unless noted).

## Before you start an epic
1. Read `agentcenter-conventions`, the epic spec, and (if UI) `ui-ux-design` + `DESIGN-SYSTEM.md`.
2. Confirm every **dependency** (prior epics' artifacts: `ctx.tenancy`, `scoped`, `requireRole`,
   `requireFeature`, `workspaceId`) exists in the codebase. If any is missing → **stop and report**.
3. Confirm every file the Reuse map cites actually exists. If a cited symbol is wrong → **stop and flag
   the spec** (do not invent a substitute).

## Per-requirement gate (run after EACH Rn)
Implement Rn following the spec's Implementation order, then run — all must pass before the next Rn:

```bash
npm run typecheck                       # tsc --noEmit across workspaces — 0 errors
npm run lint                            # next/eslint — 0 errors
npm run test:unit:no-db -w apps/web     # the unit tests for Rn (pure logic) — green
# schema change in Rn? also:
npm run db:generate                     # prisma client regenerates clean
```
Then verify the **quality rules** for what Rn touched:
- **Decisions (D1–D5):** `workspaceId` scoping + `scoped(ctx)`, human=`requireRole`/agent=`apiKeyHash`,
  feature gate = buildbase slug (not `License`), no per-agent ACL, no client-supplied `workspaceId`.
  (See `agentcenter-conventions`, `code-review`.)
- **Atomic / functional:** any counter/lease/claim is race-safe (conditional `UPDATE`/`$transaction`)
  with a concurrency test; pure logic is separated from I/O and unit-tested.
- **Reuse:** used the existing service/helper from the Reuse map — did not reinvent.
- **Security:** no secret/token/PII logged; encryption vs hashing correct. (See `security-review`.)
- **UI (if Rn is UI):** shadcn + tokens only; loading/empty/error states; responsive; a11y (light+dark);
  role + feature gated; mobile parity. (See `ui-ux-design` + `DESIGN-SYSTEM.md`.)

If any check fails → fix before proceeding. Do not weaken a test to pass.

## Per-epic gate (before opening the PR) — ALL must be green
```bash
npm run typecheck
npm run lint
npm run format:check
npm run db:migrate                              # migration applies clean on a seeded DB
npm run test:unit:no-db -w apps/web             # all unit
npm run test -w apps/web                        # integration (needs .env.test + test DB)
npm run test:e2e -w apps/web                    # e2e user flows
npm run build                                   # next build succeeds (typed, compiles)
```
Then:
- [ ] **Definition of Done** in the epic spec is **100% green** (every checkbox → its test/behavior).
- [ ] **Cross-workspace isolation** test present and green (seed 2 workspaces, no leakage).
- [ ] **Concurrency** test present for any atomic path.
- [ ] **Migration** additive → backfilled → (tightened) → **rollback documented** and idempotent.
- [ ] Events/subscriptions/types registered; feature flag wired to a buildbase slug.
- [ ] No stale refs (`Organization`, `require-role.ts` store, `License.features`, `orgId`).
- [ ] Docs: the epic spec's DoD updated to reflect what shipped; PR body lists epic + requirements (Rn)
      covered + migration notes + test evidence.
- [ ] CI (`.github/workflows/test.yaml`) green.

## PR rules
One PR per epic (or a coherent sub-milestone). Never mix epics. Branch off the default branch;
conventional-commit messages. Do not merge on red CI. If reality contradicts the spec, **stop and
report** — never silently improvise architecture (that is how undocumented, un-maintainable code is
born).

## The golden rule
**No requirement is "done" until its gate is green, and no epic ships until its full gate + DoD are
green.** This loop is what makes "everything goes as planned" true instead of hopeful.
