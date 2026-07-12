# Epic #6 — Plugin SDK (manifest + registry)

**Phase:** 5 (Extensibility) · **Gap:** 🔴 Large (Paperclip has ~35 plugin-runtime files) · **Dependencies:**
#1 (tenancy), reuses the adapter/capability model concepts from #2.

Paperclip's plugin platform is vast — a manifest schema, capability/config validators, a registry, and
a whole **runtime** (loader, sandbox, worker manager, job scheduler, tool dispatcher, event/stream
buses, state store). This epic ports the **install-time contract**: the manifest validator + the
plugin **registry** (install / enable / disable / uninstall). The entire **runtime is deferred** — a
registered plugin is inert metadata until a future runtime slice loads it. Grounded in Paperclip
`plugin-manifest-validator.ts`, `validators/plugin.ts`, `constants.ts` (`PLUGIN_CAPABILITIES`,
`PLUGIN_CATEGORIES`, `PLUGIN_API_VERSION`), and `plugin-registry.ts`.

## 0. Decisions / deviations
- **D1** — `companyId` → `workspaceId`. Registry rows are workspace-scoped (no FK).
- **D2 (scope — no runtime)** — v1 is registry + manifest validation only. NO loader, sandbox, workers,
  jobs execution, tool dispatch, or capability *enforcement*. A plugin's declared capabilities are
  recorded, not granted. Executing plugins (and gating those grants) is a documented follow-up.
- **D3 (manifest subset)** — Paperclip's Zod manifest covers UI slots, API routes, environment
  templates, webhooks, external objects, etc. v1 validates the **core**: `apiVersion`, `id`, `version`,
  `displayName`, `description?`, `category`, `capabilities[]`, and optional `tools[]` / `jobs[]`. Unknown
  top-level keys are ignored (forward-compat), unknown capabilities are rejected.
- **D4 (curated capabilities)** — `PLUGIN_CAPABILITIES` is a curated v1 subset (the read/write verbs for
  the entities already ported: projects/agents/issues/goals/skills/costs/activity + plugin.state +
  agent.tools.register + jobs/webhooks/telemetry). It expands as host support lands. `PLUGIN_CATEGORIES`
  is ported whole (`connector`, `workspace`, `automation`, `ui`).
- **D5 (flag off by default)** — `FLAG_KEYS.PLUGIN_SDK` is seeded **false** (advanced extensibility
  surface, `admin` only), like `BOARD_CHAT`.

## 1. Requirements
- **R1.** `validateManifest(input)` (pure, zod): `apiVersion === 1`; `id` a slug; `version` non-empty;
  `displayName` non-empty; `category ∈ PLUGIN_CATEGORIES`; every `capabilities[]` ∈ `PLUGIN_CAPABILITIES`;
  each `tools[]` `{name, displayName, description}`; each `jobs[]` `{jobKey, displayName, schedule?}` with
  a valid 5-field cron `schedule`. Returns `{ok, manifest} | {ok:false, errors[]}`.
- **R2.** `installPlugin(workspaceId, manifest, actor?)`: validate, then upsert by `(workspaceId, id)` —
  a new id installs; an existing id **upgrades** (version/manifest/capabilities replaced, status
  `installed`, keeps `enabled`).
- **R3.** `setPluginEnabled(workspaceId, id, enabled)` flips `enabled` (+ status `disabled`/`installed`);
  `uninstallPlugin(workspaceId, id)` removes the row; `listPlugins(workspaceId)`.
- **R4.** All gated by `requireFeature(FLAG_KEYS.PLUGIN_SDK)` (off by default), workspace-isolated,
  `admin` (install/enable/uninstall are privileged).

## 2. Non-goals / guardrails
- **DO NOT** execute plugin code / load a sandbox / dispatch tools in v1 (D2).
- **DO NOT** grant or enforce the declared capabilities — they are recorded metadata only (D2).
- **DO NOT** enable `PLUGIN_SDK` by default (D5). **DO NOT** FK `workspaceId`.

## 3. Data model — `packages/database/prisma/schema/plugin.prisma`
```prisma
enum PluginCategory { connector workspace automation ui }
enum PluginStatus   { installed disabled error }

model Plugin {
  id                   String         @id @default(cuid())
  workspaceId          String
  pluginId             String         // the manifest id (slug), unique per workspace
  name                 String
  version              String
  displayName          String
  description          String?
  category             PluginCategory
  capabilities         String[]       @default([])
  manifest             Json
  status               PluginStatus   @default(installed)
  enabled              Boolean        @default(true)
  installedByProfileId String?
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt
  @@unique([workspaceId, pluginId])
  @@index([workspaceId, status])
  @@map("plugins")
}
```

## 4-8. API / files
- **Constants** `packages/utils/src/plugin-constants.ts`: `PLUGIN_CATEGORIES`, `PLUGIN_CAPABILITIES`
  (curated), `PLUGIN_API_VERSION = 1`, types. **Flag** `FLAG_KEYS.PLUGIN_SDK` (seeded false).
- **Service** `services/plugins.ts`: pure `validateManifest`, `isValidCron`; `installPlugin`,
  `setPluginEnabled`, `uninstallPlugin`, `listPlugins`.
- **GraphQL** `types/plugin.ts`; query `plugins`; mutations `installPlugin(manifest:JSON)`,
  `setPluginEnabled(pluginId,enabled)`, `uninstallPlugin(pluginId)`.
- **UI** `/plugins`: installed list (name/version/category/capabilities/enabled) + register (paste
  manifest JSON) + enable/disable + uninstall.

## 9. Implementation order
1. Schema + constants + flag. 2. Service + validator + unit tests. 3. GraphQL + integration tests.
4. UI + client + nav.

## 10. Test cases
- Unit: `validateManifest` accepts a well-formed manifest; rejects wrong apiVersion, bad id, unknown
  category, unknown capability, malformed tool, bad cron; `isValidCron` (5-field valid/invalid).
- Integration: install validates + persists; re-install with a higher version upgrades in place (one
  row, new version, `enabled` preserved); disable/enable flips status; uninstall removes; isolation;
  admin-only; gate (off by default → denied; enabled → allowed).

## 11. Definition of Done
Manifest validation faithful to the ported subset + a workspace-scoped registry (install/upgrade/
enable/disable/uninstall); runtime explicitly deferred; flag off by default; admin-only + isolated;
unit+integration green.

## 12. Risks
- **Executing untrusted plugin code** → not in v1; registry is inert metadata (D2); a real runtime
  ships behind its own gate + sandbox later.
- **Capability confusion** → capabilities are recorded, not granted; the UI/labels say "declared".
- **Manifest drift** → unknown top-level keys ignored (forward-compat); unknown capabilities rejected.
