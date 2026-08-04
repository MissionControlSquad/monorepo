---
name: code-review
description: >
  How to review an AgentCenter diff before merge — correctness, the D1–D5 decisions, reuse over
  reinvention, tests, and enterprise cleanliness. Use when reviewing a PR or your own change before
  opening one.
---

# Code review

Review for correctness first, then decisions-compliance, then quality. Be specific; cite lines.

## 1. Correctness

- Does it do what the requirement says? Trace one concrete failing input → wrong output.
- Edge cases: empty, null, concurrency (races), large inputs, error paths.
- No swallowed errors; no `any` papering over a type; no dead/duplicated code.

## 2. Decisions compliance (D1–D5 — the common failure)

- [ ] No agent modeled as a buildbase user; agents keep `apiKeyHash`; no agent→buildbase call. (D1/D2)
- [ ] `workspaceId String` on every new root (no FK, indexed); every read `scoped(ctx)`. (D5)
- [ ] Human mutations `requireRole`; feature gate is a **buildbase slug**, not `License.features`. (D4)
- [ ] No per-agent object-ACL sneaking in; gate the mutation, not the object. (D3)
- [ ] `workspaceId`/`createdBy` from `ctx.tenancy`, never client input.

## 3. Reuse over reinvention

- Is there an existing service/model/helper it should have used? (Check the reuse map in the epic spec.)
- Does a cited file/function actually exist and have that name/signature? Flag stale references.

## 4. Tests

- [ ] Unit + integration + e2e present for the change; ≥1 test per requirement.
- [ ] Cross-workspace isolation test (scoped features) and concurrency test (atomic paths) present.
- [ ] Migration is additive/backfilled/reversible and idempotent; runs on a seeded DB.
- Tests assert real behavior — not weakened to pass.

## 5. Cleanliness

- Matches surrounding code (naming, structure, comment density). No new UI kit/colors (see ui-ux-design).
- Secrets/tokens/PII never logged; encryption vs hashing correct (see security-review).
- Migration/rollback documented; feature flag wired; events/subscriptions registered.

## Verdict

Block on: correctness bugs, decision violations, missing isolation/concurrency tests, security issues.
Nit (non-blocking): style, naming, minor duplication. Rank findings most-severe first with the fix.
