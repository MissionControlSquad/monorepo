# 22b — buildbase feature-slug config (paste into the dashboard)

Configure these **63 feature slugs** in the buildbase plan group (`PLAN_GROUP_SLUG`). **Slug = the
`FLAG_KEYS` value verbatim** (snake_case). For each plan, set `features[slug] = true/false` per the
tier. Once every slug exists, set `USE_BUILDBASE_FEATURES=1` in the tenant env to cut over; then the
local `feature_flags` table + admin UI + infra seeding get deleted.

> Source of truth for the list: `packages/utils/src/feature-flag-keys.ts`. Tiers below are a starting
> recommendation — you decide the final per-plan split in the dashboard.

## 🟢 Core — set `true` on every plan (19)
`channels` · `analytics` · `recurring_tasks` · `reviews` · `documents` · `agent_queue` ·
`notifications` · `api_keys` · `agent_instructions` · `task_relations` · `external_links` ·
`annotations` · `attention` · `folders` · `thread_interactions` · `feedback` · `voting` · `goals` ·
`org_chart`

## 🔵 Plan-gated — unlock by tier (40)
`governance` · `budgets` · `ledger` · `multi_provider_adapters` · `secrets_vault` ·
`secret_proposals` · `pipelines_routines` · `task_autonomy` · `cases` · `skills_teams` ·
`workspace_portability` · `observability` · `board_chat` · `plugin_sdk` · `plugin_runtime` ·
`terminals` · `agent_authz` · `monitors` · `runners` · `memory` · `environments` ·
`execution_policy` · `execution_workspaces` · `custom_images` · `low_trust_review` ·
`agent_companies` · `cloud_upstreams` · `provider_auth` · `local_services` · `ai_tools` ·
`adapter_plugins` · `artifacts` · `assets` · `work_products` · `decision_training` ·
`inbox_policy` · `live_gateway` · `productivity_review` · `external_objects` · `provider_quota`

## ⚙️ Operational — set `true` on every plan (not sold; toggled via buildbase features screen) (4)
`telemetry` · `tool_runtime_metrics` · `continuation_summaries` · `smoke_lab`

## Notes
- **Quota/limits** (agents, projects, seats, budgets) are buildbase `quotas`/`limits`, NOT booleans —
  configure separately; server enforcement is tracked in gap-plan `01`/quota (still TODO).
- A workspace can override any slug via buildbase `updateFeature(workspaceId, slug, value)` (the
  built-in features screen) — that replaces the old admin toggle.
- After cutover verified: delete `feature_flags` model+migration, the GraphQL feature-flags
  query/mutation/subscription, `FeatureFlagsCard`, the self-host license feature-gate, and infra
  `seed_feature_flags` + `/api/clients/[slug]/features`. See `22-feature-flags-to-buildbase.md`.
