# Test Coverage Map

Companion to [`DEVELOPER-AND-TESTING-GUIDE.md`](./DEVELOPER-AND-TESTING-GUIDE.md). This is the result of a
rigorous coverage audit of the service layer, plus the gaps this branch closed.

## How the audit was done

An automated pass flagged **23 of 121 service files** as having "no test that imports them by path." That
raw signal is misleading on its own, because of the architecture (see the guide §2/§5): **pure logic lives
in `packages/utils` and is unit-tested there; service orchestration is exercised through integration tests
that drive the real route/GraphQL, not by importing the service module.** So a service can be fully covered
on both axes and still show up as "no direct import."

Each of the 23 was then read in full and cross-checked against all 220 test files (by function name,
GraphQL op name, and route path — not just filename). Verdicts:

- **COVERED** — logic + orchestration adequately tested elsewhere.
- **PARTIAL** — most covered; one specific behavior untested.
- **GENUINE GAP** — no meaningful test anywhere; classified by testability.

**Result: 13 COVERED · 4 PARTIAL · 6 GENUINE GAPS.** The 98 services not in the "23" are reached directly
by name in tests and were out of scope for this pass.

## The 23 flagged services

| Service | What it does | Where it's actually tested | Verdict |
|---|---|---|---|
| agent-context | Assembles per-task agent context bundle | `integration/agent-context.test.ts` (route: bundle/denial/gate/auth) | COVERED |
| agent-instructions | Per-agent AGENTS.md CRUD + role defaults | `integration/` + `unit/agent-instructions.test.ts` | COVERED |
| boardroom | Board-concierge chat threads + feedback | `unit/` + `integration/boardroom.test.ts` | COVERED |
| cost-rollup | Recursive-CTE spend roll-up over a task subtree | `integration/finance.graphql.test.ts` (costByTaskTree) | COVERED |
| finance-events | Account FinanceEvent ingest + summaries | `unit/finance-events.test.ts` + `integration/finance.graphql.test.ts` | COVERED |
| issue-goal-fallback | Re-export of goal-id resolvers | `unit/goals.test.ts` + `integration/goal-task-wiring.test.ts` | COVERED |
| observability | Workspace summary group-bys | `unit/observability.test.ts` + `integration/observability.test.ts` | COVERED |
| plugins | Plugin registry install/upgrade/enable/uninstall | `unit/` + `integration/plugins.test.ts` | COVERED |
| profile-analytics | Task/activity/cost summaries | `unit/` + `integration/profile-analytics.test.ts` | COVERED |
| skill-policy | Allow-deny policy + assertSkillAction | `unit/skill-policy.test.ts` + `integration/skills-teams.test.ts` | COVERED |
| subtree-control | Recursive cancel/restore of a task subtree | `integration/task-autonomy.test.ts` | COVERED |
| thread-interactions | Typed agent asks + human resolve | `unit/` + `integration/task-autonomy.test.ts` | COVERED |
| work-products | Deliverable create + canonical-primary + review | `unit/` + `integration/work-products.test.ts` | COVERED |
| approvals | Governance create/decide/quorum/hire | `unit/graphql-governance.test.ts` (most ops) | PARTIAL — `cancelApproval` guard + `addComment` isolation untested |
| terminal-pty-handler | Browser WS ↔ SSH byte relay | `integration/terminal-pty.test.ts` (deps only) | PARTIAL (INFRA-BOUND) — WS orchestration untested |
| trust | Trust profile upsert + denorm cache sync | pure `evaluateTrust` in `unit/trust.test.ts`; callers write the row directly | PARTIAL → **CLOSED here** |
| email | `sendEmail` via Resend HTTP (no-op if unkeyed) | none (also zero prod callers) | GENUINE GAP (PURE) — deferred, see below |
| live-gateway-handler | WS dispatch for mc-bridge | `unit/live-gateway.test.ts` covers only the registry | GENUINE GAP (INFRA-BOUND) |
| mention-auto-assign | Squad-Lead @mention auto-assign | wired only via GraphQL `createMessage`, no lead-sender test | GENUINE GAP (INTEGRATION) |
| notification-buildbase | Dormant buildbase delivery adapter | none | GENUINE GAP (PURE) → **CLOSED here** |
| notification-metrics | In-memory observability counters | incidental only | GENUINE GAP (PURE) → **CLOSED here** |
| notification | `notify()` in-app record + rate-limit + dedup | `unit/notification-handler.test.ts` covers a *different* file | GENUINE GAP (PURE, DB-mock) |
| ssh-keys | RSA-4096 keygen + OpenSSH wire + AES-GCM | none (a different `services/ssh` is mocked elsewhere) | GENUINE GAP (PURE) → **CLOSED here** |

## Gaps closed on this branch

Four new test files, **14 assertions, all green**, typecheck 12/12:

| New test | Kind | What it locks down |
|---|---|---|
| `tests/unit/ssh-keys.test.ts` | pure | OpenSSH `ssh-rsa` wire encoding (parses the wire blob's type tag + mpints), PKCS1 PEM output, AES-256-GCM encrypt/decrypt roundtrip, random-IV non-determinism, and **wrong-secret auth-tag failure** (tamper detection). Highest-risk: hand-rolled DER→wire + crypto. |
| `tests/unit/notification-metrics.test.ts` | pure | increment-by-1/-n, per-counter isolation, **defensive-copy on read** (mutating the snapshot can't corrupt internal state), full reset. |
| `tests/unit/notification-buildbase.test.ts` | pure | The **fail-safe contract**: unprovisioned env reports disabled and `deliverViaBuildbase` returns `"skip"` (never throws, never false-claims delivery) for any record — even one carrying a `workspaceId`. |
| `tests/integration/trust-profile-sync.test.ts` | integration | The **denormalization invariant**: `setTrustProfile` keeps `Agent.trustLevel` (cache) in sync with `AgentTrustProfile.trustLevel` (source of truth) in one transaction — asserted on both the create and the update path. Every other test bypassed this service by writing the row directly. |

## Deferred (identified, intentionally not added here)

Real gaps, but each needs more than a cheap unit test — noted so they aren't lost:

- **`notification` (`notify()`)** — PURE but requires mocking Prisma + the buildbase delegate to drive the
  rate-limiter (31st call in 5 min dropped), the P2002 dedup swallow, and the "delivery errors never
  propagate" fail-safe. Worth doing as a focused mocked-DB unit test; skipped here to avoid a brittle
  hand-rolled Prisma mock. Highest remaining value of the deferred set.
- **`mention-auto-assign`** — INTEGRATION: drive the GraphQL `createMessage` mutation with a **Squad-Lead**
  sender and a `@mention`, assert the mentioned agent becomes task assignee + project member (and that a
  non-lead sender does not trigger it). Needs the message-mutation fixture set up.
- **`approvals`** — add `cancelApproval` (+ the cannot-cancel-an-approved guard) and `addComment`
  workspace-isolation to the existing `graphql-governance` suite.
- **`email`** — PURE but module-memoizes its provider and reads live `env`; low priority (zero production
  callers today). Test the "no key → returns false" and "non-OK response → false" branches with a `fetch`
  + `env` mock when a caller lands.
- **`live-gateway-handler` / `terminal-pty-handler`** — INFRA-BOUND (WS + SSH + bcrypt + pubsub). The most
  security-relevant untested path is `handleTaskDone` rejecting a `task_done` from an agent not assigned to
  the task; best covered by a handler-level test with mocked ws/ssh rather than a live socket.

## Running the new tests

```bash
cd apps/web && DISABLE_FLAG_CACHE=1 npx dotenv -e .env.test -- npx vitest run \
  tests/unit/ssh-keys.test.ts \
  tests/unit/notification-metrics.test.ts \
  tests/unit/notification-buildbase.test.ts \
  tests/integration/trust-profile-sync.test.ts --hookTimeout=40000
# → Test Files 4 passed (4) · Tests 14 passed (14)
```
