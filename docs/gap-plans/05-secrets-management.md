# Epic #5 — Secrets management

**Phase:** 2 (Agent breadth) · **Gap:** 🔴 Large
**Dependencies:** #1 (Organization / OrgRole / `require-role.ts`), #2 (`AgentAdapter` for adapter-scoped bindings).

AgentCenter has no general secret store — only purpose-built creds (`CloudVM.sshPrivateKey`,
`LiveGatewayToken.tokenHash`, `Agent.apiKeyHash`). This epic adds an org-scoped vault with
versioning + rotation, pluggable providers (env/aws/vault) with health, bindings that inject
secrets as env vars into agent/adapter runtimes, and an access-event audit log. **Encryption at
rest is REQUIRED** and reuses the exact AES-256-GCM envelope already shipping in `services/ssh-keys.ts`.

---

## Target model
```
Secret  (org-scoped, name unique per org)
  ├─ versions ─────► SecretVersion   (ciphertext "iv:authTag:ct" AES-256-GCM; rotation = new version)
  ├─ provider ─────► SecretProviderConfig   (env | aws | vault; health)
  ├─ bindings ─────► SecretBinding ──► Agent  OR  AgentAdapter   (+ exposed envVarName)
  └─ accessEvents ─► SecretAccessEvent   (created/read/rotated/bound/injected — audit)

Injection path:  SecretBinding → secrets.resolveEnvForAgent()  → agent-config-generator bundle
                 → mc-bridge-plugin delivers env → agent runtime   (decrypt happens server-side ONLY)
```

## Schema changes — `packages/database/prisma/schema/secret.prisma`
```prisma
enum SecretProviderKind { env  aws  vault }
enum SecretBindingScope { agent  adapter }
enum SecretAccessAction { created  read  rotated  bound  unbound  revealed  injected }

model Secret {
  id             String   @id @default(cuid())
  organizationId String                                   // from epic #1
  name           String                                   // logical, e.g. "OPENAI_API_KEY"
  description    String?
  providerId     String?                                  // null = local envelope-encrypted (default)
  currentVersion Int      @default(1)
  createdBy      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  provider     SecretProviderConfig? @relation(fields: [providerId], references: [id], onDelete: SetNull)
  versions     SecretVersion[]
  bindings     SecretBinding[]
  accessEvents SecretAccessEvent[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("secrets")
}

model SecretVersion {
  id         String    @id @default(cuid())
  secretId   String
  version    Int
  ciphertext String    @db.Text        // "iv:authTag:ciphertext" — AES-256-GCM (ssh-keys.ts envelope)
  keyId      String    @default("env") // which master key wrapped this → supports master-key rotation
  createdBy  String?
  createdAt  DateTime  @default(now())
  retiredAt  DateTime?

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)

  @@unique([secretId, version])
  @@index([secretId])
  @@map("secret_versions")
}

model SecretProviderConfig {
  id             String             @id @default(cuid())
  organizationId String
  kind           SecretProviderKind @default(env)
  name           String
  config         Json               // non-secret settings (region, path prefix); its creds live as a Secret
  healthy        Boolean            @default(false)
  lastCheckedAt  DateTime?
  lastError      String?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  secrets      Secret[]

  @@unique([organizationId, name])
  @@map("secret_provider_configs")
}

model SecretBinding {
  id            String             @id @default(cuid())
  secretId      String
  scope         SecretBindingScope
  agentId       String?
  adapterType   String?
  envVarName    String                              // exposed env var injected into runtime
  pinnedVersion Int?                                // null = follow Secret.currentVersion
  createdBy     String?
  createdAt     DateTime           @default(now())

  secret  Secret        @relation(fields: [secretId], references: [id], onDelete: Cascade)
  agent   Agent?        @relation(fields: [agentId], references: [id], onDelete: Cascade)
  adapter AgentAdapter? @relation(fields: [adapterType], references: [type], onDelete: Cascade)

  @@unique([agentId, envVarName])
  @@index([secretId])
  @@index([agentId])
  @@index([adapterType])
  @@map("secret_bindings")
}

model SecretAccessEvent {
  id        String             @id @default(cuid())
  secretId  String
  action    SecretAccessAction
  actorType String                                  // "user" | "agent" | "system"
  actorId   String?
  agentId   String?
  version   Int?
  metadata  Json?
  createdAt DateTime           @default(now())

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)

  @@index([secretId, createdAt])
  @@index([agentId])
  @@map("secret_access_events")
}
```
Edits: add `secretBindings SecretBinding[]` to `Agent` + `AgentAdapter`; add `secrets Secret[]` + `secretProviders SecretProviderConfig[]` to `Organization`.

## Reuse analysis (don't reinvent)
| Need | Reuse (real path) | New? |
|---|---|---|
| **Encryption at rest** | `services/ssh-keys.ts` — `encryptPrivateKey`/`decryptPrivateKey` (AES-256-GCM, `iv:authTag:ciphertext`, key = `sha256(secret)`) | **Reuse the exact envelope** in `secrets-crypto.ts`; only the master-key env var differs. No new crypto. |
| Master-key wiring | `env.ts` (`SSH_KEY_ENCRYPTION_SECRET` precedent) | **Extend** — add sibling `SECRET_ENCRYPTION_KEY`. |
| Non-reversible-cred hashing | `api-key.ts` (SHA-256), `LiveGatewayToken.tokenHash` (bcrypt) | **Not applicable by design** — secrets must be *reversible* (injected as env), so we encrypt, not hash. Called out to avoid the wrong pattern. |
| Runtime env delivery | `agent-config-generator.ts` (`getConfigBundleForAgent`) + `mc-bridge-plugin/src/ws-client.ts` (`deliverToLocalAgent`) | **Extend** — inject resolved env vars into the bundle; reuse the bridge delivery path. |
| Agent-authenticated fetch | existing `agents/me/route.ts` auth via `Agent.apiKeyHash` | **Reuse** for `agents/me/secrets`. |
| Provider health precedent | `services/cloud-vm.ts` health/status patterns | **Pattern reuse** for `secret-providers.ts`. |
| Scaffolding + gating | `_lib/*`, Pothos `builder.prismaObject`, `feature-flags.ts`, `license.ts` | **Reuse**. |

**Genuinely new:** `Secret`, `SecretVersion`, `SecretProviderConfig`, `SecretBinding`, `SecretAccessEvent`, `services/secrets*.ts` — the repo has only purpose-specific creds and no general versioned bindable vault.

## GraphQL / REST / Backend / UI
- **GraphQL `secret.ts`:** `Secret` exposes `name`/`description`/`currentVersion`/`provider`/relations — **never** a value field. `SecretVersion` exposes `version`/`keyId`/timestamps only — **not** `ciphertext`. Mutations (all `require-role('admin'|'owner')`): `createSecret`, `rotateSecret`, `bindSecret`, `unbindSecret`, `createSecretProvider`, `checkProviderHealth`. **No query/mutation ever returns plaintext or ciphertext.**
- **REST (admin/owner):** `secrets/route.ts`, `secrets/[id]/route.ts`, `.../rotate`, `.../versions`, `.../bindings`; `secret-providers/route.ts` + `[id]/health`. Runtime resolution (agent-authenticated, not admin): `agents/me/secrets/route.ts` returns decrypted env at delivery over TLS + writes `SecretAccessEvent{action:injected}` — the only endpoint that ever emits plaintext, and only to the owning agent.
- **Backend:** `services/secrets-crypto.ts` (mirror `ssh-keys.ts` envelope; `keyId` supports KMS/master-key rotation), `services/secrets.ts` (`createSecret`/`rotateSecret`/`getDecrypted` server-only/`bindSecret`/`resolveEnvForAgent`), `services/secret-providers.ts` (health), `models/secret.ts`. Extend `agent-config-generator.ts` to call `resolveEnvForAgent` — env injected via bundle → delivered by `mc-bridge-plugin`, **never** written into the visible markdown files. Add `SECRET_ENCRYPTION_KEY` to `env.ts`.
- **UI:** `settings/secrets/` (vault list, create/rotate write-only value, version history, provider config + health, bindings manager, access-event audit) admin/owner-gated; per-agent "Secrets" tab shows bound env var **names only**. Mobile read-only.

## Feature-flag + license
- `FeatureFlag` key `secrets_vault` double-gated via `isFeatureEnabled()` (flag AND `License.features` includes `secrets.vault`). All write paths additionally enforced by `require-role.ts` (admin/owner only).

## Migration script (end-to-end)
```bash
# 1. 5 new tables + inverse relations on Agent/AgentAdapter/Organization
pnpm --filter @agentcenter/database exec prisma migrate dev --name add_secrets_vault
pnpm --filter @agentcenter/database exec prisma generate
```
```sql
-- 2. Seed a default env provider per org so the vault is usable immediately (idempotent)
INSERT INTO secret_provider_configs (id, "organizationId", kind, name, config, healthy, "createdAt", "updatedAt")
SELECT gen_random_uuid(), o.id, 'env', 'Local (envelope-encrypted)', '{}'::jsonb, true, now(), now()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM secret_provider_configs p WHERE p."organizationId" = o.id AND p.name = 'Local (envelope-encrypted)'
);
```
```bash
# 3. Verify the master key is set BEFORE any secret is written (fail-closed)
#    SECRET_ENCRYPTION_KEY must be a >=32-char high-entropy value in prod (validated in env.ts).
```
No data backfill for `Secret`/`SecretVersion` — they start empty. Prod: `prisma migrate deploy`; seed runs idempotently from `startup-migrations.ts`. **Rollback:** revert `add_secrets_vault` — drops all five tables + inverse relations; clean because nothing else references secrets yet. (If secrets exist, export/rotate before rollback since ciphertext is destroyed with the tables.)

## Test cases
**Unit (`apps/web/tests/unit`, `vitest.unit-no-db.config.ts`):**
- `secrets-crypto.test.ts` — round-trip encrypt→decrypt; **tampered `authTag`/ciphertext throws** (GCM integrity); output format `iv:authTag:ciphertext`; two encryptions of the same plaintext differ (random IV).
- `secrets.test.ts` — `rotateSecret` creates version N+1 and bumps `currentVersion`; `resolveEnvForAgent` merges agent + adapter bindings, honoring `pinnedVersion`.
- `feature-flags.test.ts` (extend) — `secrets_vault` off ⇒ vault endpoints unavailable.

**Integration (GraphQL + DB, `vitest.config.ts`):**
- `graphql-secrets.test.ts` — **secret value is AES-GCM encrypted at rest (`secret_versions.ciphertext` != plaintext) and is never returned in plaintext via GraphQL**; `createSecret`/`rotateSecret`/`bindSecret` succeed only for admin/owner, rejected for member (#1 `require-role`).
- `secret-audit.test.ts` — create/rotate/bind/inject each write a `SecretAccessEvent` with correct `action` + `actorType`.

**E2E (`apps/web/tests/e2e`):**
- `secrets-injection-flow.test.ts` — create secret → bind to agent as `OPENAI_API_KEY` → agent (authed by `apiKeyHash`) fetches `agents/me/secrets` → receives decrypted value, non-owning agent gets 403; assert an `injected` audit row.
- extend `full-flow.test.ts` — a fresh org boots with the seeded `env` provider marked healthy.

## Best-approach confirmation
Envelope encryption with AES-256-GCM reusing the proven `ssh-keys.ts` implementation is correct: it
is authenticated (GCM detects tampering), already battle-tested for `CloudVM.sshPrivateKey`, and needs
only a dedicated master key from env (upgradable to KMS via the `keyId` column) — so encryption-at-rest
is satisfied without a new crypto dependency. **Rejected:** hashing (irreversible — secrets must be
injected as env) and plaintext gated only by DB access (fails the at-rest requirement). Modeling
rotation as immutable append-only `SecretVersion` rows + an append-only `SecretAccessEvent` log fits
auditability and matches existing history-table conventions (`status_history`, `cloud_vm_logs`).

## Acceptance checklist
- [ ] Every secret value stored only as AES-256-GCM ciphertext; plaintext never persisted or logged; `SECRET_ENCRYPTION_KEY` required in prod.
- [ ] Rotation creates a new `SecretVersion`, repoints `currentVersion`, retires the prior; reversible via history.
- [ ] Binding injects the secret as the named env var into the agent's bundle; `injected` audit recorded.
- [ ] Every read/reveal/rotate/bind/unbind writes a `SecretAccessEvent`; audit timeline renders it.
- [ ] Non-admins cannot create/rotate/reveal/bind; agents resolve only their own bindings.
- [ ] AWS/Vault provider configs report health and resolve live without storing the upstream value locally.
- [ ] GraphQL/REST never return ciphertext or plaintext except the audited one-shot reveal.
- [ ] Feature flag off ⇒ vault UI and routes inert.

## Risks
- **Key management:** a single master key = total vault loss on key loss / total compromise on leak. `keyId` per version enables KMS migration; document a re-encrypt key-rotation job.
- **Plaintext sprawl:** decrypted values only in memory on the resolve path; audit for accidental logging/persistence.
- **Provider trust boundary:** `SecretProviderConfig.config` must never hold raw upstream creds (those are themselves Secrets).
- **Runtime delivery for gateway agents:** env transmitted over the authenticated WS channel and landed as process env, not a persisted plaintext file.
- **Cascade blast radius:** deleting a secret cascades bindings and can break running agents — confirm listing affected agents; prefer soft-disable when bindings exist.
- **Audit completeness:** centralize logging in `services/secrets/audit.ts` so no resolve path skips it.
