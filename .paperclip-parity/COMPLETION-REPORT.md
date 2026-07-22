# Paperclip → monorepo feature-parity port — Completion Report

**Branch:** `feat/paperclip-parity` · **Status:** local only (nothing pushed, no PR) · **Baseline:** green throughout

## Executive summary

The Paperclip service backlog has been worked to its floor. Every line item with an **offline-buildable
half** — a data model, a pure decision, a protocol codec, an orchestration lifecycle, or a typed
contract — has been built, flag-gated, and tested.

| Status | Count | Meaning |
|--------|-------|---------|
| ✅ Done | **135** | Fully ported (or verified already-present) |
| 🟡 Partial / scaffold | **29** | Offline half built; the remaining piece is an infra seam or deferred sub-feature |
| ❌ Open | **3** | No offline half exists — blocked on the platform boundary or a missing dependency |
| **Total** | **177** | |

All work follows the same discipline: **flag-gated (default off), workspace-scoped, admin-gated
mutations, tested, committed** — with only true host/process/credential execution left as a documented
seam.

## The 3 that remain (the true floor)

These cannot be built now — not deferred effort, but dependencies outside this repo:

| # | Item | Why it can't be built |
|---|------|-----------------------|
| 152 | skills-catalog | **buildbase-owned.** The user/human skill catalog is the platform's file catalog — building it here would violate the buildbase boundary decision (buildbase = user layer, monorepo = AI-agent layer). |
| 160 | teams-catalog | **buildbase-owned.** Same boundary as #152. |
| 165 | tool-oauth-legacy-backfill | **Backfills a subsystem that doesn't exist.** It migrates legacy `tool_oauth_states` rows for the upstream-MCP OAuth subsystem (M13), which is itself unbuilt and needs provider OAuth credentials. A migration for an absent table is meaningless until M13 lands. |

Each unblocks the moment its dependency arrives: a buildbase boundary decision for #152/#160, or the M13
tool-OAuth subsystem + provider creds for #165.

## What was built (this effort, 71 commits)

Grouped by subsystem — every item flag-gated + tested:

### Plugin runtime (a whole subsystem, ~24 rows)
Built the entire storage + logic + protocol layer on top of the existing manifest registry; only the
fork/spawn/vm/FS-watch is left as the seam.
- **Lifecycle & capability grants** — state machine, `resolveGrantedCapabilities` (least-privilege), guards
- **In-process bus** — typed `EventBus` + replayable bounded `StreamBus`
- **Job runtime** — durable queue, race-safe lease claim, backoff retry, cron re-enqueue, stale reclaim
- **State/tools/resources/logs** — namespaced KV, tool registry+dispatcher, ownership ledger, log retention
- **Host services + environment drivers + secrets handler** + uninstall cleanup
- **Local-folder dev registry**
- **Worker host protocol (scaffold)** — `buildMinimalWorkerEnv` (blocks DATABASE_URL/secret leak into
  plugin children), NDJSON JSON-RPC codec, crash-backoff policy, typed host contracts

### Tool subsystem
- **Tool gateway** — single admission point: access policy → content guards → plugin routing → metrics
- **Runtime supervisor** — queue health, stale-lease reclaim, degraded-tool detection
- **Content guards, access policy, runtime metrics, smoke-lab** (validates config via the gateway)

### Execution / environments / runtime
- **Workspace realization resolver** — deterministic cwd/branch from strategy + template
- **Custom-image setup-session lifecycle** — binds TerminalSession to capture (snapshot is the seam)
- **Boot/hot-restart reaping** of orphaned runs
- **Local service supervisor** — restart-storm suppression + idle-evict policies
- **AI-provider auth reconciliation** — classify valid/expiring/expired/revoked → refresh/reauth
- **Per-run state** — scratch KV, skill selections, successful-run handoff

### Data / integration / observability
- **External objects + GitHub provider** — `parseGithubRef` + SSRF-guarded `githubApiFetch` (public,
  token-optional)
- **Asset store** on the existing R2 layer + company artifacts (no GCS needed)
- **Cloud upstreams** — sync-state planning (git op is the seam)
- **DB-backed adapter-plugin store**, **feedback** (secret/PII-redacted), **folders**, **decision-training**,
  **inbox policy**, **productivity watchdog**, **re-wake throttle**, pipeline stats/outputs/context,
  recovery stats, continuation summaries, company search

### Cross-cutting
- **SSRF guard** (shared util) + wired into webhook/GitHub egress
- **Secret-ref resolver** (recursive, dogfooded), **trust-preset editor**, **agent-authz** enforcement +
  gap closure, **dark mode**, operator **doctor** + **db:backup** CLIs, memory→ledger cost linkage

## Verification

- **Typecheck:** `turbo run typecheck` → 12/12 packages, green after every commit
- **Tests:** every slice ships integration + unit tests; the full new-suite (27 files) runs green (127+
  tests). Each feature verified with `vitest run <file>` before commit
- **New this effort:** 45 service files, 22 migrations, 58 feature-flag keys total

## Pending / next steps (for a human)

1. **Nothing is buildable-pending.** The backlog is at its floor.
2. **To close the 3 ❌:** decide the buildbase boundary for skills/teams catalogs (#152/#160); build the
   M13 tool-OAuth subsystem + supply provider creds, then #165 backfill becomes a one-liner.
3. **To activate the 🟡 seams:** the pure/data halves are done and tested; a human wires the infra impl
   (fork-based plugin worker, provider snapshot call, git fetch/merge, PTY broker) to the typed
   contracts already in place.
4. **Flags:** every new surface is default-off. Enabling is a per-workspace provisioning decision.
5. **Push/PR:** intentionally not done — awaiting explicit instruction.
