---
name: prisma-graphql-patterns
description: >
  The exact recipe for adding or changing a Prisma model, Pothos GraphQL type/query/mutation/
  subscription, or Next.js REST route in AgentCenter, matching existing code. Use whenever
  implementing a data model + API surface for any epic.
---

# Prisma + Pothos/Yoga + REST patterns

Match the existing code; do not invent structure. Reference files in parentheses are canonical examples.

## 1. Prisma model (`packages/database/prisma/schema/<domain>.prisma`)

- New split file per domain. `id String @id @default(cuid())`; `@@map("snake_case")`; lowercase enums;
  explicit `@@index` for every query predicate; `workspaceId String` + `@@index([workspaceId])` on every
  root (no FK — D5). Timestamps `createdAt @default(now())` / `updatedAt @updatedAt`.
- Money is **integer cents** (`Int`), never float/Decimal.
- Add back-relations to existing models by editing their `.prisma` file (additive only).
- Format: `pnpm --filter @agentcenter/database prisma format`.

## 2. Data-access module (`packages/database/src/<domain>/`)

- Files `create.ts`, `find-*.ts`, `update.ts`, `index.ts` (mirror `src/cloud-vm/`); re-export the barrel
  from `packages/database/src/index.ts`. All finders take `workspaceId` and filter on it.
- Atomic counters/leases: `prisma.$transaction` + `update({ field: { increment } })` (mirror
  `updateAgentStatusAtomically`), or a conditional `UPDATE ... WHERE` for race-free claims.

## 3. GraphQL type (`packages/graphql-server/src/types/<name>.ts`)

- `builder.prismaObject("Model", { fields: t => ({ ... }) })`; expose only safe fields (never
  ciphertext/hashes/other-tenant data). Register with a side-effect `import "./<name>"` in
  `packages/graphql-server/src/types/index.ts`. Aggregates use `builder.simpleObject` (see
  `queries/analytics.ts`).

## 4. GraphQL ops (`apps/web/src/server/graphql/{queries,mutations,subscriptions}/<name>.ts`)

Every resolver body, in order:
```ts
await requireFeature(ctx, FLAG_KEYS.X);      // buildbase feature slug (NOT License)
requireRole(ctx, 'admin');                    // human mutations only
const where = scoped(ctx, { ...filter });     // injects workspaceId
// ...prisma call...
emit(EventTypes.X_HAPPENED, payload);         // if a side-effect matters
pubsub.publish(topic, row);                   // if live
```
Register the module in the graphql root barrel (as `mutations/reviews.ts` is).

## 5. REST route (`apps/web/app/api/<path>/route.ts`)

- Agent endpoints: `const agent = await resolveAgent(request)` (Bearer `mc_`); human endpoints:
  `resolveSession`. `validateBody(request, zodSchema)`. Respond with `successResponse`/`errorResponse`/
  `handleError` (`_lib/json-response.ts`). Wrap public/agent endpoints in `withRateLimit`.
- Foreign-workspace ids → **404** (not 403) to avoid existence leakage.
- Feature-gate with `_lib/with-feature.ts` (buildbase slug).

## Checklist before you call it done

- [ ] `workspaceId` on the model + every finder + every resolver `scoped(ctx)`.
- [ ] Registered: prisma back-relations, `types/index.ts`, graphql op barrels.
- [ ] `pnpm prisma generate` clean; Pothos types regenerate.
- [ ] Feature gate is a buildbase slug; no `License.features`.
- [ ] Cross-workspace isolation test exists (see `testing-standards`).
