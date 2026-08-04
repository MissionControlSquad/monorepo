# Epic #2 — Multi-provider agent adapters

**Phase:** 2 (Agent breadth) · **Gap:** 🔴 Large
**Dependencies:** #1 (Organization / OrgRole / `require-role.ts`).

AgentCenter today has no adapter concept: an `Agent` is implicitly an OpenClaw instance reached
through the first-party bridge (`packages/mc-bridge-plugin`). This epic makes the adapter explicit
and pluggable, registers the existing bridge as **one** adapter (`openclaw-gateway`), and adds a
registry so a new provider (e.g. `claude-local`) plugs in via data + a service module, with zero
disruption to running OpenClaw agents.

---

## Target model
```
AgentAdapter                     (registry — one row per adapter TYPE)
  ├─ type "openclaw-gateway"     (builtIn; wraps existing mc-bridge-plugin) ◀── nothing breaks
  ├─ type "claude-local"         (new provider, plugs in via seed + service module)
  ├─ type "codex-local" … (11 total: claude/codex/cursor/gemini/grok/opencode/pi-local,
  │                               cursor-cloud, hermes, hermes-gateway, openclaw-gateway)
  ├─ configSchema  (JSON Schema draft-07, validates Agent.adapterConfig)
  ├─ transport | authKind | enabled | builtIn
  └─ modelProfiles ──► AdapterModelProfile   (per-adapter model catalog; static or detected)

Agent  (extended, not replaced)
  ├─ adapterType   ──FK──► AgentAdapter.type   (backfilled "openclaw-gateway")
  ├─ adapterConfig JSON                          (validated vs AgentAdapter.configSchema)
  └─ (existing)  hostingType · llmModel · cloudVmId · apiKeyHash · templateId · configVersion
```

## Schema changes — `packages/database/prisma/schema/adapter.prisma`
```prisma
enum AdapterTransport {
  local        // spawns a local CLI/process: claude-local, codex-local, gemini-local, …
  gateway      // persistent WS gateway: openclaw-gateway, hermes-gateway
  cloud        // provider-hosted: cursor-cloud
}

enum AdapterAuthKind {
  none
  apiKey
  subscription   // Claude/Codex subscription auth panels
  secretBinding  // resolves creds from #5 secret bindings
}

model AgentAdapter {
  id           String           @id @default(cuid())
  type         String           @unique              // stable key; new providers add a row, no migration
  displayName  String
  transport    AdapterTransport @default(local)
  authKind     AdapterAuthKind  @default(apiKey)
  configSchema Json                                  // JSON Schema (draft-07) for Agent.adapterConfig
  version      String           @default("1.0.0")
  enabled      Boolean          @default(true)
  builtIn      Boolean          @default(false)      // openclaw-gateway: cannot be deleted/disabled
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  modelProfiles AdapterModelProfile[]
  agents        Agent[]               @relation("AgentAdapterType")

  @@index([enabled])
  @@map("agent_adapters")
}

model AdapterModelProfile {
  id            String   @id @default(cuid())
  adapterType   String
  modelId       String                               // "claude-sonnet-4-5", "gpt-5-codex", …
  displayName   String
  contextWindow Int?
  isDefault     Boolean  @default(false)
  detected      Boolean  @default(false)             // detected per-install vs statically seeded
  metadata      Json?
  createdAt     DateTime @default(now())

  adapter AgentAdapter @relation(fields: [adapterType], references: [type], onDelete: Cascade)

  @@unique([adapterType, modelId])
  @@index([adapterType])
  @@map("adapter_model_profiles")
}
```
Edits to `agent.prisma` (`model Agent`):
```prisma
  adapterType   String?                              // FK → AgentAdapter.type; NOT NULL after backfill
  adapterConfig Json?                                // per-agent config, validated vs configSchema
  adapter       AgentAdapter? @relation("AgentAdapterType", fields: [adapterType], references: [type], onDelete: Restrict)
  // … existing fields unchanged (llmModel retained for back-compat) …
  @@index([adapterType])
```

## Reuse analysis (don't reinvent)
| Need | Reuse (real path) | New? |
|---|---|---|
| OpenClaw delivery + status/telemetry | `packages/mc-bridge-plugin/src/{ws-client,agent-reporter,openclaw-local}.ts` + `apps/web/src/server/services/{live-task-delivery,live-gateway-handler,live-connection-registry}.ts` | **Reuse** — wrapped by `adapters/openclaw-gateway.ts`; bridge becomes exactly one registered adapter, wire protocol unchanged. |
| Agent identity / auth | `apps/web/src/server/api-key.ts` (`generateApiKey`/`hashApiKey`, SHA-256) + `agents/_lib/create-agent.ts` | **Reuse** — adapters don't touch agent auth. |
| Config delivery to runtime | `apps/web/src/server/agent-config-generator.ts` (`getConfigBundleForAgent`, `CURRENT_CONFIG_VERSION`) | **Extend** — add `adapterType`/`adapterConfig`; `upgradeAvailable` already surfaces the version bump. |
| Per-model config precedent | `apps/web/app/api/cloud-vms/[id]/llm-config/route.ts` + `services/cloud-vm.ts` (`configureLLMOnVM`, `CloudVM.llmProvider/llmModel`) | **Reuse the pattern**; keep `Agent.llmModel` as back-compat override. |
| REST/GraphQL scaffolding | `_lib/json-response.ts`, `_lib/validation.ts`, `models/base.ts`, Pothos `builder.prismaObject` | **Reuse** — identical conventions. |
| Feature/license gating | `feature-flags.ts` `isFeatureEnabled`, `license.ts` `isFeatureLicensed`/`checkLicenseLimit` | **Reuse**. |

**Genuinely new:** `AgentAdapter`, `AdapterModelProfile`, `adapters/registry.ts`, `adapters/claude-local.ts` — no registry or multi-provider concept exists today.

## GraphQL / REST / Backend / UI
- **GraphQL:** `agent-adapter.ts` (`AgentAdapter` + `AdapterModelProfile` prismaObjects); extend `agent.ts` with `adapterType`/`adapterConfig`/`adapter` relation. Queries `agentAdapters(enabledOnly)`, `adapterModelProfiles(adapterType)`; mutation `setAgentAdapter`. Install/reload/detect are REST (side-effecting).
- **REST (mirror `cloud-vms/[id]/…`):** `adapters/route.ts`, `adapters/[type]/route.ts`, `.../reload`, `.../install`, `.../models`, `.../detect-models`, `.../subscription-auth`, `agents/[id]/adapter/route.ts` (validates config vs `configSchema`).
- **Backend:** `adapters/registry.ts` (list/get/validate/reload), `adapters/openclaw-gateway.ts` (delegates to existing bridge plumbing; honors `vm.hello`/`mc.welcome`, `vm.agent_status`/`vm.agent_message`/`vm.task_done`), `adapters/claude-local.ts` (worked example), `models/agent-adapter.ts`. Extend `agent-config-generator.ts` to emit `adapterType`/`adapterConfig` + bump `CURRENT_CONFIG_VERSION`.
- **UI:** `settings/adapters/` (registry table, config-schema form, model browser, Claude/Codex subscription-auth panels); agent create/edit adapter picker + schema-driven config + model selector. Mobile adapter picker.

## Feature-flag + license
- `FeatureFlag` key `multi_provider_adapters` (double-gated: flag AND `License.features` includes `adapters.multiProvider`). **Critical:** `openclaw-gateway` is `builtIn: true` and always resolvable regardless of the flag, so existing agents keep running when the feature is off.

## Migration script (end-to-end)
```bash
# 1. Adds tables + NULLABLE Agent.adapterType/adapterConfig
pnpm --filter @agentcenter/database exec prisma migrate dev --name add_agent_adapters
pnpm --filter @agentcenter/database exec prisma generate
```
```sql
-- 2. Seed the 11 adapters (idempotent). openclaw-gateway is builtIn.
INSERT INTO agent_adapters (id, type, "displayName", transport, "authKind", "configSchema", "builtIn", enabled, "createdAt", "updatedAt")
VALUES
 (gen_random_uuid(), 'openclaw-gateway', 'OpenClaw (Gateway)', 'gateway', 'apiKey',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{}}'::jsonb, true, true, now(), now()),
 (gen_random_uuid(), 'claude-local', 'Claude (Local CLI)', 'local', 'subscription',
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"model":{"type":"string"}}}'::jsonb, false, true, now(), now())
 -- … codex-local, cursor-local, cursor-cloud, gemini-local, grok-local, opencode-local, pi-local, hermes, hermes-gateway …
ON CONFLICT (type) DO NOTHING;

-- 3. Backfill existing agents to the OpenClaw adapter (all OpenClaw today)
UPDATE agents SET "adapterType" = 'openclaw-gateway' WHERE "adapterType" IS NULL;
```
```prisma
// 4. Tighten to NOT NULL in a follow-up migration, once backfill verified
adapterType String @default("openclaw-gateway")   // change String? → String
```
```bash
pnpm --filter @agentcenter/database exec prisma migrate dev --name agent_adapter_type_required
```
Prod: `prisma migrate deploy`; steps 2-3 run idempotently via `startup-migrations.ts`. **Rollback:** revert to `add_agent_adapters` (drops the two tables + FK; `adapterType`/`adapterConfig` nullable there, no data loss); the two follow-ups are the only destructive step and are reversed first.

## Test cases
**Unit (`apps/web/tests/unit`, `vitest.unit-no-db.config.ts`):**
- `adapters/registry.test.ts` — `validateAdapterConfig` accepts a schema-valid config, rejects an extra/typed-wrong field; `getAdapter('openclaw-gateway')` resolves even with flag off.
- `agent-config-generator.test.ts` (extend) — bundle includes `adapterType`/`adapterConfig`; `CURRENT_CONFIG_VERSION` bump flips `upgradeAvailable`.
- `feature-flags.test.ts` (extend) — flag off ⇒ non-OpenClaw adapters filtered, `openclaw-gateway` still returned.

**Integration (GraphQL + DB, `vitest.config.ts`):**
- `graphql-agent-adapters.test.ts` — `agentAdapters` returns seeded rows; `setAgentAdapter` writes `adapterType`; unknown type or config failing `configSchema` rejected.
- extend `graphql-agents.test.ts` — `Agent.adapter` relation + `adapterConfig` resolve.

**E2E (`apps/web/tests/e2e`):**
- extend `live-gateway-apis.test.ts` — **existing OpenClaw agent still delivers/receives a task after the adapter migration** (proves the wrapper preserves the `vm.hello`/`mc.welcome`/`vm.task_done` contract).
- `adapters-flow.test.ts` — create agent with `claude-local`, PUT `/api/agents/[id]/adapter`, fetch config bundle, assert adapter fields present.

## Best-approach confirmation
Modeling the adapter as a data row keyed by a stable `type` string (not a Prisma enum) is the right
fit: a new provider is a seed row + a service module with **no schema migration**, and the existing
bridge slots in as one `builtIn` adapter so no running agent is disturbed. **Rejected:** a hard-coded
`AdapterType` enum on `Agent` — it forces a migration per provider and can't carry per-adapter
`configSchema`/model catalogs. Keeping `Agent.llmModel` alongside `adapterConfig` preserves the
current cloud-VM LLM-override behavior during transition.

## Acceptance checklist
- [ ] Existing OpenClaw agents keep working with zero config change; backfilled to `openclaw-gateway`.
- [ ] `openclaw-gateway.configSchema` matches `mc-bridge-plugin/config-schema.json`.
- [ ] Bridge handshake + `vm.agent_status` reporting unchanged for gateway adapters.
- [ ] A new `claude-local` adapter can be enabled, configured from its schema, assigned to an agent; its bundle differs from the OpenClaw bundle.
- [ ] `adapterConfig` rejected server-side when it violates `configSchema`.
- [ ] Model detection populates `AdapterModelProfile` per company; agent model dropdown lists only that adapter's enabled models.
- [ ] Feature flag off ⇒ only `openclaw-gateway` selectable; non-admins cannot install/enable adapters.

## Risks
- **Backfill gap:** `adapterType` nullable during rollout — config-bundle for a not-yet-backfilled agent must fall back to `openclaw-gateway`, not 500. Ship the fallback before flipping to required.
- **Schema drift:** DB `configSchema` can diverge from the shipped plugin's schema; `reload` must re-seed built-ins from source on deploy.
- **Secret leakage:** adapter creds flow only through #5 bindings; a validator rejects secret-shaped values inlined in `adapterConfig`.
- **Heterogeneous status:** `localProcess`/`cloudApi` adapters report via REST heartbeat, not WS — surface "last heartbeat" consistently.
- **Enum growth:** keeping `type` a string (not a PG enum) avoids a migration per provider.
