# Epic #12 — CLI / programmatic access (API keys)

**Phase:** 5 (Extensibility) · **Gap:** 🟠 Runtime-adjacent (the CLI binary is a separate tool) ·
**Dependencies:** #1 (tenancy). Reuses the existing `api-key` util (`generateApiKey`, `hashApiKey`).

Paperclip ships a `cli/` package that authenticates against the server with **board API keys** (hashed
tokens) obtained through a device-auth challenge (`cli_auth_challenges`). The CLI binary and the
browser-approval device flow are out of scope here; this epic ports the **portable server surface that
makes a CLI possible**: workspace **API keys (personal access tokens)** — mint (one-time reveal), list
(hash never exposed), revoke, and verify. Grounded in Paperclip `board_api_keys` +
`services/board-auth.ts`.

## 0. Decisions / deviations
- **D1** — Paperclip keys are per-`authUser`; here they are **workspace-scoped** (`workspaceId`, no FK) —
  a key authenticates programmatic access to one workspace. `createdByProfileId` records the minter.
- **D2 (scope — token, not device flow)** — v1 is the "mint a token, paste it into your CLI/script"
  flow (like a GitHub PAT). The `cli_auth_challenges` **device-authorization flow** (CLI shows a code →
  human approves in the browser → key minted) is a documented follow-up; it *builds on* this API-key
  primitive.
- **D3 (secret handling)** — the plaintext key is returned **exactly once** at mint time and never
  again; only `keyHash` (sha256) + `keyPrefix` (first 12 chars, for display) are stored. list/GraphQL
  never expose `keyHash` or the plaintext (mirrors the secrets-vault reveal discipline from #5).
- **D4 (verify → WIRED into auth middleware)** — `verifyApiKey(plainKey)` resolves an active key to its
  `{ workspaceId, apiKeyId, createdByProfileId }` and stamps `lastUsedAt`. **Now wired**: `resolveTenancy`
  checks an `Authorization: Bearer mc_…` header first (before the buildbase cookie). A key authenticates
  as least-privilege **`member`** (a leaked key must not wield `admin`), scoped to the key's workspace,
  attributed to the minting profile. Gated by the `API_KEYS` flag as an admin **kill-switch** — turning
  the feature off immediately stops key auth. (Originally a deferred seam; wired in a follow-up pass.)

## 1. Requirements
- **R1.** `ApiKey { workspaceId, name, keyHash (unique), keyPrefix, createdByProfileId?, lastUsedAt?,
  revokedAt?, expiresAt? }`.
- **R2.** `mintApiKey(workspaceId, name, {expiresAt?, createdByProfileId?})` → `{ record, plainKey }`;
  `plainKey` is surfaced once. Reuses `generateApiKey()`.
- **R3.** `listApiKeys(workspaceId)` returns records **without** `keyHash`. `revokeApiKey(workspaceId,
  id)` sets `revokedAt` (idempotent; never deletes — audit trail).
- **R4.** `verifyApiKey(plainKey)` → active key's `{ workspaceId, apiKeyId }` or null; stamps
  `lastUsedAt`. Active = not revoked AND (no `expiresAt` OR `expiresAt > now`).
- **R5.** Pure `isApiKeyActive(key, now)`, `redactKey(prefix)`. All ops gated by
  `requireFeature(FLAG_KEYS.API_KEYS)`, workspace-isolated, `admin` (minting an auth credential is
  privileged).

## 2. Non-goals / guardrails
- **DO NOT** ship the CLI binary or the device-auth challenge flow in v1 (D2).
- **DO NOT** store or ever return the plaintext key after mint, or expose `keyHash` (D3).
- **DO NOT** wire API-key auth into the request middleware in v1 (D4). **DO NOT** FK `workspaceId`.
- **DO NOT** hard-delete a key (revoke = tombstone for audit).

## 3. Data model — `packages/database/prisma/schema/api-key.prisma`
```prisma
model ApiKey {
  id                 String    @id @default(cuid())
  workspaceId        String
  name               String
  keyHash            String    @unique
  keyPrefix          String
  createdByProfileId String?
  lastUsedAt         DateTime?
  revokedAt          DateTime?
  expiresAt          DateTime?
  createdAt          DateTime  @default(now())
  @@index([workspaceId, revokedAt])
  @@map("api_keys")
}
```

## 4-8. API / files
- **Flag** `FLAG_KEYS.API_KEYS` (default true; startup seed). Migration `add_api_keys` (1 table).
- **Service** `services/api-keys.ts`: pure `isApiKeyActive`, `redactKey`; `mintApiKey`, `listApiKeys`,
  `revokeApiKey`, `verifyApiKey`. Reuses `server/api-key` (`generateApiKey`, `hashApiKey`).
- **GraphQL** `types/api-key.ts` (ApiKey — no keyHash field); `MintedApiKey` simpleObject (record +
  `plainKey`); query `apiKeys`; mutations `mintApiKey(name, expiresAt?)` → MintedApiKey,
  `revokeApiKey(id)`.
- **UI** `/api-keys`: mint form → one-time reveal banner (copy) + list (name/prefix/lastUsed/expiry/
  revoke).

## 9. Implementation order
1. Schema + flag. 2. Service + pure helpers + unit tests. 3. GraphQL + integration tests. 4. UI + client.

## 10. Test cases
- Unit: `isApiKeyActive` (fresh active; revoked → inactive; expired → inactive; future-expiry active);
  `redactKey`; `hashApiKey` determinism.
- Integration: mint returns a `plainKey` whose hash matches the stored row; the plaintext appears
  nowhere in `apiKeys`; `verifyApiKey` resolves a fresh key, rejects a revoked + an expired key and
  stamps `lastUsedAt`; revoke is idempotent; isolation; admin-only; gate.

## 11. Definition of Done
Workspace API keys: mint (one-time reveal) / list (no secret) / revoke (tombstone) / verify (active +
lastUsedAt), keys stored hashed; device flow + middleware wiring documented as deferred; gated by
API_KEYS + admin + isolated; unit+integration green.

## 12. Risks
- **Key leakage** → plaintext returned once, only hash+prefix persisted, never re-exposed (D3);
  integration test asserts the plaintext is absent from list responses.
- **Stolen key longevity** → `expiresAt` + revoke (tombstone) + `verifyApiKey` active-check.
- **Auth bypass via unwired verify** → verify is not yet in the middleware (D4); until wired, keys grant
  nothing — documented, not implied.
