# Paperclip → Mission Control monorepo — Parity Comparison (refreshed 2026‑08‑10)

**This supersedes the 2026‑07/08 version of this file and the stale `INDEX.mdx`.** It is a fresh,
feature‑by‑feature re‑verification done after the 30‑feature port landed on `main`, so the numbers are
materially higher than the previous comparison (which predated the merge and overstated the gaps).

## Methodology (how this was produced, so it's auditable)

- **Paperclip re‑pulled:** `github.com/paperclipai/paperclip` `master`, `19be4cf92` → `6a4e2e1b8`. The only
  2 new commits are bug fixes (routine‑checkout 409, worktree runtime port) — **no new Paperclip
  features**, so the parity baseline is effectively current.
- **Monorepo side = `main`** (`9d3306b`), which contains the full port (verified: `implement-new-functionalities`
  is 0 commits ahead of `main`; parity‑signature files such as `execution-workspace-policy.ts`,
  `environment-custom-images.ts`, `agent-memory.ts`, `skill-policy.ts` are all present on `origin/main`).
- **14 domains re‑verified in parallel**, each feature located in Paperclip source **and** re‑checked
  against current monorepo source (not trusting the prior doc's statuses). Every status below is cited to a
  real path in the domain working notes; this file is the synthesis.

**Boundary (never port — provided by `@buildbase/sdk`, confirmed mounted):** human auth, billing, human
orgs/workspaces/RBAC, invites, join‑requests, **and the MCP transport / Applications‑Connections plane**
(`@buildbase/sdk/mcp` is mounted at `apps/web/app/api/mcp/route.ts`, dormant until env‑provisioned). These
are 🚫 by design, not gaps, and are excluded from the "buildable surface" denominators below.

---

## 1. Scorecard — parity by domain (re‑verified)

| # | Domain | Parity (buildable surface) | Prior doc implied | Headline finding |
|---|---|---:|---:|---|
| 01 | Environments & Execution | **~86%** | ~30% | Full env/lease/workspace/custom‑image spine built and wired into `sandbox-run.ts` |
| 02 | Adapters & Runtimes | **~72%** | ~25–30% | Unified alias‑linked registry with real `execute()` + transcript parsing + self‑install |
| 03 | Sandbox depth | **~82%** | ~30% | Leased, persisted, streamed, custom‑image seam; all 3 prior prod blockers closed |
| 04 | Memory | **~88%** | ~40% | Ahead of Paperclip (their control‑plane is design‑only; we have tables/audit/cost/jobs/UI) |
| 05 | Skills & Knowledge | **~72%** | ~35% | Authoring/import/update/policy/comments/sync‑modeling all shipped |
| 06 | Plugins & MCP | **~60%** | ~15% | Full data‑model/registry/gateway/audit; execution runtime is a deliberate seam |
| 07 | Secrets | **~72%** | ~40% | External providers + audited resolve + proposals + run‑redaction all closed |
| 08 | Work Items | **~87%** | ~45% | Work‑product taxonomy, review gate, runs, attachments, annotations all landed |
| 09 | Heartbeat & Scheduling | **~88%** | ~35% | Wakeup queue, retries/backoff, stranded‑work, watchdogs, cron scanner, auto‑sleep |
| 10 | Connectivity | **~88%** | ~40% | Ed25519 pairing, hermes HTTP+SSE, one‑time key claim, run‑scoped bridge all real |
| 11 | UI | **~88%** (46/52 pages) | 4 big ❌ | Environments, Execution‑Workspace, JsonSchemaForm, unified Agent Detail all built |
| 12 | Cost & Observability | **~90%** | mostly ❌ | FinanceEvent ledger, quota framework, telemetry, OTel, pino, run‑log store all landed |
| 13 | Deployment & CLI | **~55%** | "no CLI" | Operator CLI + fail‑closed trust enforcement landed; self‑host adoption polish remains |
| 14 | Teams & Governance | **~82%** | 2 big ❌ | AgentCompany model + hire‑approval wiring + markdown export/import + org‑chart SVG |

**Overall: ~79% parity of the buildable (non‑buildbase) surface.** The consistent story across all 14
domains: the prior comparison's headline ❌ items are **closed**; what remains is depth/fill‑in and a few
genuinely‑unbuilt subsystems — enumerated in §3.

---

## 2. What the merged work closed (the delta the old doc missed)

Every prior "biggest gap" per domain is now real, cited code:

- **Environments/Sandbox:** first‑class `Environment` + `EnvironmentLease` (reuse/retain/reaper) +
  `ExecutionWorkspace` + pure policy resolver + execution allowlist + low‑trust fail‑closed containment +
  probe + custom‑image capture/overlay/rollback + live run status + run‑scoped in‑sandbox bridge. All three
  prod blockers (runtime install, private‑repo auth, run persistence via `AgentRun`) closed.
- **Adapters:** all 8 local runtimes have code modules + alias table unifying Tier‑A/Tier‑D keys; adapter‑owned
  `execute()` + per‑runtime `parseLine` + error taxonomy + install catalog + live detection; real hermes SSE
  gateway; NAT‑pull WS gateway with Ed25519 device pairing.
- **Memory:** operations audit, post‑run capture (was dead code), company default resolution, inspect UI,
  adapter registry, agent tools, cost linkage, async `MemoryJob` queue.
- **Skills:** frontmatter/file‑kind/trust, external import (GitHub/URL/local/skills.sh), update/audit/reset,
  runtime sync + merge‑mode state machine, governance policy engine, comments.
- **Secrets:** AWS + Vault resolvers, audit‑on‑resolve (success **and** failure), secret proposals, run secret
  redaction (dual‑layer).
- **Cost/Obs:** `FinanceEvent` ledger, provider‑quota framework, telemetry contract+sink, OTel opt‑in, pino,
  run‑log store — the single biggest cluster of prior ❌.
- **Work Items:** work‑product PR/branch/commit taxonomy + review‑state gate, `AgentRun` + logs/liveness/retry,
  asset/attachment pipeline, document anchored annotations + re‑anchor, dependency wakeups, external‑object
  sync, origin/idempotency, `low_trust_review` now actually consumed.
- **Heartbeat:** wakeup queue (coalescing/idempotency), scheduled retries + backoff, stranded‑work
  reconciliation, subtree + silent‑run watchdogs, task monitors, cron parser+tz, auto‑sleep registered.
- **Connectivity:** Ed25519 pairing + operator approval, hermes HTTP+SSE adapter, one‑time agent‑key claim,
  run‑scoped bridge token.
- **Plugins:** secret‑refs, managed resources, state KV, cron queue, tool‑admission gateway + audit,
  worker‑protocol security primitives, mounted buildbase MCP endpoint.
- **UI:** JsonSchemaForm, Environments, Execution‑Workspace detail, unified 7‑tab Agent Detail, Plugin detail,
  AI‑Tools doctor, Cloud‑upstream, Memory inspect, org‑chart SVG (~46 of ~52 non‑buildbase pages present).
- **Teams:** `AgentCompany` (`agentcompanies/v1`) model + migration, `hire_agent` approval fulfilment (creates
  the agent on approve), markdown company export/import + Mermaid README, org‑chart SVG renderer.
- **Deployment/CLI:** `scripts/operator.mjs` (doctor/env:check/db:backup/migrate‑status/install/update/service),
  named trust presets, fail‑closed sandbox admission, execution allowlist, untrusted‑output review quarantine.

---

## 3. Genuinely remaining, buildable backlog (the honest gaps)

Prioritized by value. None are architectural — the scaffolding exists in almost every case.

### High‑value

1. **Adapter argv fidelity (quality risk).** The 5 thin runtimes — `cursor`, `grok`, `opencode`, `pi`,
   `hermes` — are **build‑only shims whose argv is self‑flagged as unverified against the real CLIs**
   (`adapters.ts` comment). Only `claude`/`codex`/`gemini` were live‑verified this session. These need the
   same real‑CLI verification (missing `--output-format stream-json`/`--json`/`--yolo`/etc.) + `execute()`/`parseLine`.
2. **Cloud sandbox provider depth.** Lease `resume`/`snapshot`/`pause` and template capture are implemented
   **only for `local`**; e2b/daytona/modal/novita/k8s implement `provision` only, so reuse/capture silently
   degrade to ephemeral. Also: **secret‑version lease fingerprint** (a resumed box can run with stale rotated
   creds), **in‑flight run cancellation** (only queued runs cancel — no `AbortSignal` into `exec`), and
   **sandbox cost population** (`AgentRun.costCents` never written for sandbox runs).
3. **`testEnvironment` preflight** (adapters) — highest‑value clean adapter gap; no per‑adapter environment
   check before dispatch.
4. **Plugin execution runtime** — out‑of‑process worker `fork()` + host↔worker RPC + capability
   **enforcement** (`requirePluginCapability` has zero callers, no `plugin_grants` table). Security‑critical;
   currently contract/primitives only.
5. **Skills app‑shipped catalog package** — real dir tree + build step + `generated/catalog.json` +
   GitHub‑pinned refs (today it's 3 hardcoded seed manifests). Plus **runtime skill‑sync push/materialization**
   (modeled, not pushed) and **Skill Studio real test‑run execution** (both correctly blocked on the
   agent‑execution/harness domain).

### Medium

6. **UI clusters:** MCP/OAuth app‑connections catalog + tools‑governance (Profiles/Policies) pages; Secrets
   *My‑secrets* + *Vaults‑management* tabs; a dedicated env‑variables editor widget (dotenv‑paste,
   convert‑to‑secret, sensitive heuristic); DesignGuide showcase.
7. **Secrets model depth:** user‑scoped secret **definitions/declarations/coverage** (today just a `personal`
   bool); rich binding model (9 scopes vs 2, `tool_connection` target, dotted `configPath`, version selector,
   projection); provider **write‑side** managed lifecycle (rotate/create‑remote/discovery — resolve+health exist).
8. **Deployment/CLI adoption polish:** `onboard`/`configure`/`run` operator commands; `token`/`connect` key
   CLI; structured versioned config file; embedded Postgres; local‑disk storage; agent‑CLIs‑preinstalled
   image + quickstart/untrusted compose variants; the **untrusted‑PR‑review Docker workflow**.
9. **Environments depth:** wire the custom‑image **setup terminal** to GraphQL/PTY (service + reaper exist);
   **WorkspaceRuntimeService** long‑lived dev servers (the one genuinely‑absent subsystem here); branch
   reconciliation (forward/override/quarantine); unified `EnvironmentRuntimeDriver` so `ssh`/`plugin` envs
   become runnable; generic pre‑dispatch config/binding gate.
10. **Cost/Obs finish work:** telemetry proposed‑event extractor + typed `EventDimensionsMap`; wire a
    concrete provider‑quota adapter (framework off by default); project‑scope + lifetime‑window budgets;
    HTTP‑log‑policy middleware; S3 mirroring of run logs.
11. **Scheduling refinements:** per‑agent `maxConcurrentRuns` + priority dispatch (FIFO+batch‑cap today);
    `concurrencyPolicy`/`catchUpPolicy` on routines; fold project‑pause into the unified wake‑suppression guard.
12. **Work‑item small items:** `WorkMode` enum; `backlog` status; rich comment `presentation`;
    `createdByRunId` on `Message`; generic `DocumentRevision` table; Task‑scoped `Label`; enforce
    blocker‑prevents‑checkout at claim time.
13. **Teams/package format:** multi‑kind markdown packages (`TEAM.md`/`PROJECT.md`/`TASK.md`/`SKILL.md`),
    GitHub‑pinned+sha256 import graph, `.paperclip.yaml` sidecar; a shipped markdown teams catalog (teams are
    code‑templated today); board principal / board‑authz; rule‑based per‑agent approval‑policy engine.
14. **Connectivity:** the **Cursor Cloud** execution adapter (enum/seed/UI slot only — no `@cursor/sdk`
    runtime); an in‑flight live‑task **cancel** frame.

---

## 4. Deliberately skipped — confirmed intentional (not gaps)

- **Buildbase‑owned:** human auth/billing/orgs/RBAC/invites/join‑requests; the **entire MCP server +
  Applications/Connections/governance plane** (outbound MCP client, inbound JSON‑RPC gateway, catalog/risk/
  quarantine, named gateways + run‑scoped tokens, OAuth‑to‑upstream, protocol rate‑limit counters). The
  `@buildbase/sdk/mcp` handler is *mounted*, not rebuilt — per `BUILDBASE-BOUNDARY.mdx` "we don't build a
  tool gateway; we mount one."
- **External‑account‑gated:** live cloud‑provider key verification; real cloud `snapshot()`/`resume()` impls;
  managed AWS rotation/KMS; Cursor‑Cloud live SDK; provider‑quota concrete polling — the *frameworks* are
  built; the credentialed lifecycles are reasonably deferred.
- **Infra/other‑domain:** plugin out‑of‑process `node:vm` isolation + k8s multi‑tenant RBAC/network machinery;
  pgvector semantic recall (adapter slot registered); Skill Studio execution harness; named sandbox sessions
  (REPL); PARA as a product‑native store (ships as a runner skill instead); operator env‑var config tier
  (replaced by DB/admin `WorkspaceExecutionPolicy`); persistent‑server `setInterval` scheduler + process‑start
  crash recovery (replaced by Vercel cron + outbound‑poll + lease/fencing — a deliberate serverless choice).

---

## 5. Caveats (things not positively confirmed — verify before scheduling)

- The 5 thin runtime adapters' **real‑CLI argv match is unconfirmed** (see §3.1) — the one adapter claim the
  audit could not verify.
- Whether `costByTaskTree` also sums descendant **runtime wall‑clock** (cost rollup confirmed; runtime dim not).
- A few work‑item items marked "likely gap": agent upload‑artifact skill script, annotation↔comment mirroring,
  standalone blocker‑diagnostics endpoint.
- Depth on some rich pages (Pipeline stage settings, `agent` goal‑level enum) verified at file/symbol level,
  not feature‑exhaustively.

---

*Bottom line: the port is at ~79% of Paperclip's buildable, non‑buildbase surface — far past the stale doc's
picture. The remaining work is concentrated, well‑scoped, and mostly depth‑fill over existing scaffolding;
the two items worth treating as quality risks (not just backlog) are the unverified argv of the 5 thin
runtime adapters and the cloud‑provider sandbox impls that silently degrade to ephemeral.*
