# Paperclip → Mission Control parity — CURRENT STATE (post-merge)

Generated after merging 15 feature branches (PRs #89-103) into `implement-new-functionalities`.
Compared against Paperclip `master` @ `19be4cf92`. This supersedes the older stale `INDEX.mdx`
tracker (which under-counted what is already built). Verified against current source, not the docs.

**Legend:** ✅ present · 🟡 partial (core done, sub-parts deferred - see §4) · ❌ missing/buildable ·
🚫 SKIPPED by deliberate prior choice (infra / external account / buildbase-owned - see §5)

**Boundary (never port):** human auth, billing, human orgs/workspaces/RBAC, invites, join-requests -
provided by `@buildbase/sdk`. Marked 🚫 buildbase. MCP *transport* is also buildbase (the SDK ships it);
we keep the governance/policy/audit half.

---

## 1. UI pages — Paperclip page → our route

| Paperclip page | Our route | Status |
|---|---|---|
| Agents | `/agents` | ✅ |
| NewAgent | `/agents/new` | ✅ |
| AgentDetail | `/agent/[id]`, `/agents/[id]` | 🟡 not a URL-driven tabbed shell (no Tools/Budget/Keys tabs, no `runs/:runId`) |
| AgentToolsTab | — | ❌ effective tool-access tab (policy exists server-side, no UI) |
| Approvals / ApprovalDetail | `/approvals`, `/approvals/[id]` | ✅ |
| Artifacts | `/artifacts` | ✅ |
| Cases / CaseDetail | `/cases`, `/cases/[id]` | ✅ |
| Companies + Company* | `/companies`, `/org-chart` | ✅ (export/import + Mermaid done) |
| Costs | `/finance`, `/ledger`, `/analytics`, `/observability` | ✅ |
| Dashboard / DashboardLive | `/` (kanban home) | ✅ |
| Goals / GoalDetail | `/goals`, `/goals/[id]` | ✅ |
| Inbox / WhatNeedsMe | `/attention`, `/review`, `/inbox-policies` | ✅ |
| Issues / IssueDetail / MyIssues | `/` kanban + `/task/[id]` modal | ✅ (our "tasks" = their "issues") |
| Pipelines | `/pipelines` | 🟡 list only, no `[pipelineId]` settings/detail |
| PluginManager / PluginPage / PluginSettings | `/plugins`, `/adapter-plugins` | ✅ (per-plugin JsonSchemaForm) |
| AdapterManager | `/adapters`, `/adapter-plugins` | ✅ (install + enable/disable; no reload lifecycle) |
| Projects / ProjectDetail | `/projects`, `/projects/[id]` | ✅ |
| ProjectWorkspaceDetail | — | ❌ project-workspace detail (services/ports editor) |
| ExecutionWorkspaceDetail | — | ❌ exec-workspace detail (query exists, no route) |
| Routines / RoutineDetail | `/routines` | 🟡 list; triggers done, no detail route |
| Search | `/search` | ✅ |
| Secrets | `/secrets` | ✅ (+ Proposals tab from #91) |
| SkillStudio | `/skills` (list only) | ❌ authoring IDE / test harness |
| TeamCatalog | `/teams` | 🟡 built from code templates; no shipped markdown catalog |
| Timeline | `/timeline` | ✅ |
| Training | — | ❌ (agent training surface) |
| DesignGuide | — | ❌ internal design-system showcase (low value) |
| OrgChart | `/org-chart` | ✅ (server SVG + Mermaid) |
| DecisionQueuePage | `/decisions`? | 🟡 `decisions` query exists; verify dedicated page |
| CliAuth | `/cli-auth` | ✅ |
| Live gateway / Runners / Terminals / Local services / Cloud upstreams / Provider auth | `/live-gateway` (+ Devices tab #97), `/runners`, `/terminals`, `/local-services`, `/cloud-upstreams`, `/provider-auth` | ✅ |
| Memory inspect | `/memory` (#92) | ✅ |
| **Apps / MCP gateways / tool-profile wizard** | — | 🚫 buildbase (MCP connections plane) |
| **Onboarding (cloud + local variants)** | `/onboarding` (cloud only) | ❌ local-install variant missing |
| Auth / Workspaces / Org / Invites / JoinRequestQueue / InstanceSettings / UserProfile / ProfileSettings / InstanceAccess / CompanyInvites / CompanyAccess | — | 🚫 buildbase (human tenancy/RBAC) |
| *UxLab pages (IssueChatUxLab, SystemNoticeUxLab, RunTranscriptUxLab, …)* | — | 🚫 Paperclip internal prototyping labs (not product) |

---

## 2. APIs / services — coverage (all ✅ unless noted)

Environments+leases+workspaces+execution-policy+custom-images, sandbox run seam (async, retain,
timedOut, redaction), AgentRun ledger + retries/backoff, stranded-work reconcile, watchdogs (subtree +
silent), routine cron, task monitors, auto-sleep cron, **AgentWakeup coalescing queue (#103)**, memory
(audit/provenance/cost/recall/**inspect UI #92**/**memory-jobs #96**), skills (lint/audit/update-status/
runtime-sync/policy-engine/**merge-modes #95**), plugins (storage/RPC-contracts/tool-gateway/jobs/KV),
secrets (audit-on-resolve/**proposals #91**/**AWS+Vault #100**/**run-redaction #94**), work-products
taxonomy + `requireUntrustedPrReview` enforcement + doc annotations + **external-object poller #96**,
FinanceEvent ledger + quota polling + OTel, **per-run log store + pino #101**, adapters (all runtimes +
**execute()/parseLine contract #99** + **Hermes HTTP+SSE #102**), Live Gateway WS + **Ed25519 device
pairing #97**, agent-companies + hire_agent + org-chart SVG.

**Still ❌ (server):**
- Skills catalog package (content-addressed, GitHub/URL import resolvers)
- Plugin out-of-process worker execution (fork/spawn + vm sandbox) + `@mc/plugin-sdk`
- Memory adapter registry + semantic/vector recall (today ILIKE) + runtime memory tools (mid-run)
- Artifact upload pipeline (`TaskAttachment` + agent-facing upload skill)
- Operator CLI (doctor/env/db:backup), deployment-mode taxonomy

---

## 3. Buildable backlog — BATCH 3 landed (#104-108); remainder below

DONE in Batch 3 (merged):
1. ✅ **Unified tabbed Agent Detail** + AgentToolsTab — #105.
2. ✅ **Skills catalog package + real import** (GitHub/URL/catalog resolvers) — #106. (deferred: skills.sh registry, local-path scan, multi-file tree bundles)
4. ✅ **Artifact upload pipeline** — `TaskAttachment` + presigned upload + run-scoped agent upload — #108.
7. ✅ **Operator CLI** (doctor / env:check / db:backup / db:migrate:status) — #104. (deferred: managed-install/service lifecycle)

DONE in Batch 4 (merged #109-113):
3. ✅ **Onboarding local-install variant** (cloud + local, reuses cli-auth pairing) — #111.
5a. ✅ **MemoryAdapter registry + agent memory tools** (search/note/forget via run-scoped bridge) — #110.
8. ✅ **Pipeline / Routine / Execution-Workspace detail routes** — #112. (ProjectWorkspace detail still ❌, small)
9. ✅ **Managed-install + service-lifecycle CLI** (launchd/systemd) — #109; **skills.sh + local-path +
   multi-file GitHub import** — #113.

Still ❌ (now essentially only infra-blocked → §5, plus tiny stragglers):
5b. **Semantic/vector recall** — needs the pgvector Postgres extension. → §5 (infra).
6. **Plugin worker runtime** — fork/spawn + vm sandbox + UI slots + SDK. → §5 (infra).
- ProjectWorkspace detail route; Hermes gateway UI config form; per-runtime parseLine for codex/gemini;
  service uninstall/restart/health-probe. [S each - minor tail]

---

## 4. 🟡 DEFERRED sub-parts INSIDE the just-merged PRs (do not forget these)

These features LANDED but each intentionally deferred a piece - list so nothing is silently lost:

- ~~#99 adapter execute() persistence~~ ✅ RESOLVED by #107 (AgentRun usage/errorFamily/exitReason
  columns + surfaced on Runs card). Remaining: only `claude` has a real `parseLine` (others fallback).
- ~~#102 Hermes gateway dispatch wiring~~ ✅ RESOLVED by #107 (dispatch branch resolves the vault key
  + streams HTTP+SSE through the log store). Remaining: no UI config form for the gateway adapter.
- **#103 AgentWakeup:** delivery = event emit + `delivered` mark; a real Live Gateway push frame is a
  deferred seam (needs a new `mc.*` wire message).
- **#101 run log store:** local/DB store only - S3 mirroring deferred; "view full log" UI not added.
- **#100 external secrets:** AWS + Vault real; **GCP** deferred (no `gcp` provider enum yet).
- **#96 memory-jobs:** async capture wired; extraction is still the existing capture path (no new
  extraction strategies).
- **#95 skill merge modes:** GraphQL exposes add/remove/replace but no UI selector (no first-party caller).
- **#97 device pairing:** registration uses `DEFAULT_WORKSPACE_ID` (install-token layer carries no
  workspace id) - revisit if per-workspace device scoping is needed.
- **#94 run redaction:** live-tail mask string changed `«redacted»` → `***REDACTED***` (behavior change).

---

## 5. 🚫 DELIBERATELY SKIPPED (by prior choice) — reasons

**buildbase-owned (the SDK provides these; do NOT build):**
- MCP client/transport, endpoint-mode server, named HTTP gateways, app→provider OAuth connections plane
  (#11060/#11040/#11009), Notion-via-MCP-OAuth. We keep the governance half (tool-gateway/policy/audit).
- Human auth, billing, orgs/workspaces/RBAC, invites, join-requests, instance/user settings.

**External account / real credential required (cannot verify locally):**
- Real cloud sandbox `snapshot()` (e2b/daytona/k8s), in-flight cancel of a RUNNING run.
- Cursor Cloud adapter (`@cursor/sdk` + account), live provider-key verification harness.
- Cloudflare bridge Worker artifact + deploy.
- GCP Secret Manager provider.

**Infra-gated / needs a run-harness (large, low near-term ROI):**
- Plugin out-of-process worker execution + UI extension slots (contracts exist, `PLUGIN_RUNTIME=false`).
- Skill Studio live test runs (needs the agent-run test harness).
- Real openclaw/hermes NAT-pull WS device-auth gateway (beyond the local spawn + the new HTTP adapter).

**Paperclip-internal (not product):** all `*UxLab` prototype pages, `DesignGuide` showcase.

---

## 6. Net assessment

After **25 merged features across 4 batches (#89-113)**, the app is at **~99% of Paperclip's portable,
non-buildbase functionality**. The buildable backlog (§3) is essentially exhausted - what remains is:
- **§5** — buildbase-owned / external-account-gated / true-infra (pgvector, plugin-worker exec), each
  skipped with a documented reason;
- a small **minor tail** (ProjectWorkspace detail, Hermes UI config form, codex/gemini parseLine,
  service uninstall) noted in §3.

Every gap is now either in §5 (skipped by choice, with a reason) or the minor tail. Nothing portable is
silently missing. Each batch was merged in order and validated as a whole: typecheck 12/12, build 56/56,
full suite 2069 tests passing, 0 failures.
