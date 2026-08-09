---
name: security-review
description: >
  Security rules and a review checklist for AgentCenter — authz, workspace isolation, secrets/crypto,
  agent vs human auth, webhooks, and plugin sandboxing. Use when writing or reviewing anything that
  authenticates, authorizes, stores secrets, accepts external input, or crosses the workspace boundary.
---

# Security review

Workspace isolation and the human/agent auth split are **security boundaries**, not conveniences.

## Authorization

- Human mutations: `requireRole(ctx, 'admin'|'owner')` / `requirePermission` on `ctx.tenancy` (buildbase).
- Agent endpoints: `resolveAgent` (`apiKeyHash`, SHA-256). Never mix the two auth models.
- Every read: `scoped(ctx, where)`. A query must **never** return another workspace's rows. Prove it
  with a two-workspace isolation test.
- `workspaceId`/`createdBy` come from `ctx.tenancy`/resolved agent — **never** from client input.
- Foreign-workspace object ids → **404** (not 403), to avoid existence leakage.

## Secrets & crypto

- Secrets are **encrypted** at rest with the AES-256-GCM envelope from `services/ssh-keys.ts`
  (`iv:authTag:ciphertext`) — reversible because they're injected as env. **API keys/tokens are
  hashed** (SHA-256 / bcrypt) — irreversible. Never swap these.
- Plaintext secrets exist only in memory on the resolve path; never persisted to a visible file, never
  logged, never returned via GraphQL/REST except an **audited** one-shot reveal to an authorized human
  or the owning agent's runtime pull.
- Every secret read/reveal/rotate/bind writes a `SecretAccessEvent` (audit).

## External input

- Public webhooks: verify HMAC signature + `withRateLimit` + replay-guard (nonce/dedupe key). Reject bad
  signatures with 401. Never trust the payload's claimed identity.
- Validate every request body with zod (`_lib/validation.ts`). Cron routes require `env.CRON_SECRET`.

## Plugins / third-party code (epic #6)

- Default-deny capabilities: nothing works unless the manifest declares it and an admin approved it.
- Run untrusted code in an OS-process sandbox (`child_process`) with resource limits + kill-on-timeout;
  all effects go through a capability broker; a plugin cannot read another plugin's state or reach
  secrets it wasn't granted. Hosted plugin UI runs in a sandboxed, origin-checked iframe.

## Review checklist

- [ ] Correct auth model for the actor (human=buildbase role, agent=apiKeyHash).
- [ ] `scoped(ctx)` on every read; isolation test present.
- [ ] No secret/token/PII in logs or error messages; encryption vs hashing correct.
- [ ] External input validated + rate-limited + (webhooks) HMAC-verified.
- [ ] No client-controlled `workspaceId`; foreign ids 404.
- [ ] Feature gate is a buildbase slug, not `License`.
