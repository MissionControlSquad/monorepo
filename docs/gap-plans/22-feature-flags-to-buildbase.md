# 22 — Migrate feature flags → buildbase (plan entitlements + per-workspace overrides)

**Status:** planned · **Owner:** buildbase-tenancy plane · **Related:** `01-buildbase-tenancy.md`,
buildbase skill (`.claude/skills/buildbase/SKILL.md`)

## Goal

Retire AgentCenter's **local** feature-flag system (DB `feature_flags` table + self-host license
feature-gating + infra per-tenant seeding) and make **buildbase the single source of truth** for
feature entitlements. Every flag becomes a buildbase feature **slug**, gated by the customer's **plan**
(`plan.features`) with optional **per-workspace override** (`workspace.features` via
`updateFeature(workspaceId, key, value)`). Keep exactly ONE local escape hatch: a global env-var
kill-switch for engineering emergencies.

**Principle:** reuse buildbase; do not re-create. Flags are a commercial/entitlement concern → buildbase.

## Why this is safe/correct (capabilities confirmed)

buildbase's feature system already does everything our local one does, plus plan integration:
- `plan.features: Record<slug, boolean>` → inherited by `workspace.features`.
- `updateFeature(workspaceId, key, value)` → per-workspace override (== our admin toggle).
- `useUserFeatures().isFeatureEnabled(slug)` / `<WhenWorkspaceFeatureEnabled slug>` → arbitrary slugs.
- Built-in management UI: `openWorkspaceSettings("features")`.
- Permission-gated editing: `workspace:features:edit`.

## Current state (what exists today)

- **monorepo**: `apps/web/src/server/feature-flags.ts` (`isFeatureEnabled` → DB `feature_flags` +
  double-gate on self-host license `isFeatureLicensed`), `require-feature.ts`
  (`requireFeature(flag)` → `FEATURE_DISABLED`), GraphQL `feature-flags` query/mutation/subscription,
  client `useFeatureFlags()` context, `FeatureFlagsCard` on `/settings`. Registry:
  `packages/utils/src/feature-flag-keys.ts` (`FLAG_KEYS`, `FLAG_DEFAULTS`) — 65 keys.
- **infra**: `ac` CLI `seed_feature_flags` (per-tenant), `dashboard/app/api/clients/[slug]/features/route.ts`
  (per-client management), `feature_flags` table create/drop/seed.
- **buildbase**: plans exist (`PLAN_GROUP_SLUG`), rendered by the website `<PricingPage>`. The monorepo
  reads `workspace.features` **nowhere** — zero entitlement wiring today.

## Slug convention (NO hardcoded strings)

buildbase feature slug **== the `FLAG_KEYS` value** (snake_case is a valid slug). So `FLAG_KEYS`
stays the single constant registry — server + client + buildbase all key off it. No new string
literals anywhere; always reference `FLAG_KEYS.X`. The buildbase dashboard items are named with the
same slugs. (One mapping table, one source: `feature-flag-keys.ts`.)

## Classification (each `FLAG_KEYS` → tier). Product tunes the plan split.

- 🟢 **Core** (every plan; `features[slug]=true` on all plans): `channels, analytics, recurring_tasks,
  reviews, documents, agent_queue, notifications, api_keys, agent_instructions, task_relations,
  external_links, annotations, attention, folders, thread_interactions, feedback, voting, goals, org_chart`
- 🔵 **Plan-gated** (unlock by tier): `governance, budgets, ledger, multi_provider_adapters,
  secrets_vault, secret_proposals, pipelines_routines, task_autonomy, cases, skills_teams,
  workspace_portability, observability, board_chat, plugin_sdk, plugin_runtime, terminals, agent_authz,
  monitors, runners, memory, environments, execution_policy, execution_workspaces, custom_images,
  low_trust_review, agent_companies, cloud_upstreams, provider_auth, local_services, ai_tools,
  adapter_plugins, artifacts, assets, work_products, decision_training, inbox_policy, live_gateway,
  productivity_review, external_objects, provider_quota`
- ⚙️ **Operational** (not sold; still buildbase workspace-features so there is ONE system, defaulted on,
  edited via the features screen — NOT plan-tied): `telemetry, tool_runtime_metrics,
  continuation_summaries, smoke_lab`

Quota-style limits (agents, projects, seats, budgets) are buildbase **`quotas`/`limits`**, not booleans
— see plan `01`/quota enforcement (gap: server enforcement still TODO, tracked separately).

## Target resolution (server)

Rewrite `isFeatureEnabled(key)`:
1. **Global kill-switch first** — if `process.env.FEATURE_KILL_<KEY>` (or a comma list
   `DISABLED_FEATURES`) disables it → `false`. (Ops emergency, buildbase-independent.)
2. **buildbase configured** → read the current `workspace.features[key]` (from `getBuildbase().auth()`
   or a cached workspace fetch, per-request memoized like the current 60s cache). `features[key] !== false`
   = enabled (unknown slug ⇒ safe default per bucket).
3. **buildbase NOT configured** (bootstrap/degraded) → fall back to `FLAG_DEFAULTS[key]`
   (fail-open for UI features, fail-closed for sensitive/governance — encode per-key in a small
   `FLAG_FAIL_MODE` map).
4. Drop the self-host **license** feature-gate entirely (license keeps activation/expiry only).

Availability: cache `workspace.features` per request + a short TTL; on buildbase error use last-known-good
then `FLAG_DEFAULTS` + fail-mode. Never throw from the resolver.

## Target resolution (client)

`useFeatureFlags()` context folds in buildbase: prefer `useUserFeatures()` /
workspace `features`; keep `FLAG_DEFAULTS` for the loading window (`useUserFeatures().loading`).
`isEnabled(FLAG_KEYS.X)` API unchanged for all callers — only its source changes.

## Deletions (after cutover verified)

**monorepo:** `feature_flags` Prisma model + migration (drop table) · `feature-flags.ts` DB path ·
`updateFeatureFlag` mutation · `featureFlagsChanged` subscription · `FEATURE_FLAGS_QUERY` ·
`FeatureFlagsCard` (replace with a link to `openWorkspaceSettings("features")`) ·
license `isFeatureLicensed` feature-gate. **Keep** `FLAG_KEYS`/`FLAG_DEFAULTS` (now the slug registry
+ fallback) and `requireFeature()` (source swapped underneath).

**infra:** `seed_feature_flags` + its call sites in `ac` · `feature_flags` table create/drop/seed ·
`dashboard/app/api/clients/[slug]/features/route.ts` + its UI. Infra stops owning feature config —
a tenant's plan (buildbase) decides features.

## Phased rollout (reversible)

1. **Buildbase config** (product) — define all 65 slugs as plan items in `PLAN_GROUP_SLUG`; set plan
   `features` per the classification; defaults for operational slugs. *(Blocks nothing in code.)*
2. **Server read-path swap** behind `USE_BUILDBASE_FEATURES=1` — `isFeatureEnabled` reads
   `workspace.features` with cache + fail-mode; add `FLAG_FAIL_MODE` map + env kill-switch. Reversible.
3. **Client fold-in** — `useFeatureFlags()` reads buildbase; `FeatureFlagsCard` → buildbase features screen.
4. **Flip default** `USE_BUILDBASE_FEATURES` on in all envs; soak.
5. **Delete** local DB flags + GraphQL surface + license gate (monorepo) and infra seeding/route.
6. **Keep** env kill-switch.

## Verification

Per phase: `npx turbo run typecheck` (all green) + feature-flag unit tests + a manual gate check
(toggle a plan feature in buildbase → confirm the gated UI/route flips). No hardcoded slug strings
introduced (everything via `FLAG_KEYS`).

## Open product decisions (needed before Phase 1)

1. buildbase is a hard dependency in **every** deployment incl. self-host? (Required — plan says yes.)
2. Per-key fail mode when buildbase unreachable (default: UI fail-open, governance/secrets fail-closed).
3. Exact tier split of the 🔵 bucket (which plan includes what) — configured in the buildbase dashboard.
