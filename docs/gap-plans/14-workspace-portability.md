# Epic #14 — Workspace export / import

**Phase:** 6 (Polish) · **Gap:** 🟡 Medium (serialization over existing entities) · **Dependencies:**
#1 (buildbase tenancy), reuses `Agent`/`Project`/`Skill` (Epic #10) + the `resolveCollision` helper.

Ports Paperclip's company-portability: export a workspace's agents/projects/skills to a versioned
portable JSON **bundle**, and import a bundle into a workspace with a collision strategy. Grounded in
Paperclip `services/company-portability.ts` (`buildPortabilityInput`, `previewImport`, `importBundle`,
`CompanyPortabilityCollisionStrategy`).

## 0. Decisions / deviations
- **D5** — the only new table (`WorkspaceImport`, an audit record) carries `workspaceId String` (no FK).
- **Reuse** — collision handling reuses the pure `resolveCollision(existing, name, strategy)` from
  `services/teams.ts` (Epic #10). Agent/Project/Skill creation reuses the existing create paths.
- **Bundle is data, not a table.** Export returns JSON; import accepts JSON. Only the import *audit*
  is persisted. `bundleVersion = 1`.

## 1. Requirements
- **R1.** `exportWorkspaceBundle` returns a versioned JSON bundle `{ version, exportedAt, agents[],
  projects[], skills[] }` for the caller's workspace only — no cross-workspace data, no secrets/tokens
  (name/role/persona/model for agents; name/description/status for projects; key/name/markdown/
  categories/trust for skills).
- **R2.** `importWorkspaceBundle(bundle, collisionStrategy)` validates `bundle.version`, then creates
  entities in the caller's workspace: agents via `resolveCollision` (rename|skip|replace on name),
  projects by name (skip if a same-named project exists), skills by key (skip if key exists).
- **R3.** Import records a `WorkspaceImport` audit row (counts + created ids + strategy + importer);
  returns a summary `{ createdAgents, skippedAgents, createdProjects, createdSkills }`.
- **R4.** A malformed bundle (missing/mismatched `version`, non-array sections) is rejected
  `BAD_USER_INPUT`; import is best-effort per entity (one bad entity doesn't abort the whole import,
  but the summary reports it).
- **R5.** Export/import are workspace-isolated + gated by `requireFeature(FLAG_KEYS.WORKSPACE_PORTABILITY)`;
  export is `member` (read), import is `admin` (it provisions agents = high-impact).

## 2. Non-goals / guardrails
- **DO NOT** export secrets, API keys, checkout tokens, budgets, ledger, or buildbase identity — a
  bundle is portable *config*, never credentials.
- **DO NOT** import into another workspace than the caller's `ctx.tenancy.workspaceId`.
- **DO NOT** create a full generic entity-graph importer — cover agents/projects/skills only (v1);
  tasks/cases/pipelines are out of scope.
- **DO NOT** FK `workspaceId`.

## 3. Data model — `packages/database/prisma/schema/portability.prisma`
```prisma
model WorkspaceImport {
  id                 String   @id @default(cuid())
  workspaceId        String
  bundleVersion      Int
  collisionStrategy  CollisionStrategy   // reuses Epic #10 enum
  createdAgentIds    String[] @default([])
  createdProjectIds  String[] @default([])
  createdSkillIds    String[] @default([])
  summary            Json
  importedByProfileId String?
  createdAt          DateTime @default(now())
  @@index([workspaceId, createdAt])
  @@map("workspace_imports")
}
```
No back-relations (audit-only). Reuses the `CollisionStrategy` enum from `skill.prisma` (Epic #10).

## 4-8. API / migration / files
- **Flag** `FLAG_KEYS.WORKSPACE_PORTABILITY` (default true; startup seed). Migration `add_workspace_imports`
  (1 table, no new enum).
- **Service** `services/portability.ts`: pure `validateBundle(bundle)`; `exportWorkspaceBundle(workspaceId)`;
  `importWorkspaceBundle({workspaceId, bundle, collisionStrategy, importedByProfileId})`.
- **GraphQL** `types/portability.ts` (WorkspaceImport + WorkspaceImportSummary simpleObject); query
  `exportWorkspaceBundle` (returns JSON) + `workspaceImports`; mutation `importWorkspaceBundle(bundle:JSON,
  collisionStrategy:String)`.
- **UI** `/portability`: Export (renders/downloads the JSON bundle) + Import (paste JSON + collision
  strategy → summary + history).

## 9. Implementation order
1. Schema + migration + flag. 2. Service + pure `validateBundle` + unit tests. 3. GraphQL + integration
tests. 4. UI + client.

## 10. Test cases
- Unit: `validateBundle` (accepts v1 well-formed; rejects wrong version / non-array sections).
- Integration: export returns the workspace's agents/projects/skills (no other workspace's); import
  creates agents (rename on collision), skips same-named projects + same-key skills, records a
  WorkspaceImport with correct counts; round-trip (export A → import into B) reproduces the entities;
  malformed bundle rejected; import is admin-only; export omits secrets; isolation; gate.

## 11. Definition of Done
Export produces a portable, credential-free, workspace-scoped bundle; import re-creates
agents/projects/skills with the collision strategy + audit row + summary; malformed rejected; isolation
proven; gated by WORKSPACE_PORTABILITY + role; unit+integration green.

## 12. Risks
- **Import blast radius** → `admin` only; `replace` collisions recorded; agent create reuses existing
  validation.
- **Secret leakage in a bundle** → export whitelists safe fields only; test asserts no token/hash field.
- **Partial import** → per-entity best-effort; summary reports created/skipped counts.
