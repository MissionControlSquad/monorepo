/**
 * Secrets vault service (Epic #5). Workspace-scoped. Values are stored ONLY as AES-256-GCM
 * ciphertext; plaintext is accepted on write and produced on the server-only resolve path, never
 * returned via the public API and never persisted/logged in the clear. Every state change writes an
 * append-only SecretAccessEvent.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type {
  Secret,
  SecretBinding,
  SecretAccessAction,
  SecretProviderConfig,
  SecretProviderKind,
} from "@agentcenter/database";
import { encryptSecret, decryptSecret, CURRENT_KEY_ID } from "./secrets-crypto";
import { checkSecretProviderConfigHealth, getSecretProviderModule } from "@agentcenter/utils";
import { resolveExternalSecret } from "./secret-external";
import { badRequest, notFound } from "./service-errors";

/** Append a secret access-event (audit). Centralized so no path skips the log. */
export function recordSecretAccess(input: {
  secretId: string;
  action: SecretAccessAction;
  actorType: "user" | "agent" | "system";
  actorId?: string | null;
  agentId?: string | null;
  version?: number | null;
  // Audit-on-resolve provenance (Domain 7 P1).
  consumerType?: string | null;
  consumerId?: string | null;
  configPath?: string | null;
  outcome?: string | null;
  errorCode?: string | null;
  runId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.secretAccessEvent.create({
    data: {
      secretId: input.secretId,
      action: input.action,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      agentId: input.agentId ?? null,
      version: input.version ?? null,
      consumerType: input.consumerType ?? null,
      consumerId: input.consumerId ?? null,
      configPath: input.configPath ?? null,
      outcome: input.outcome ?? null,
      errorCode: input.errorCode ?? null,
      runId: input.runId ?? null,
      metadata: (input.metadata ?? undefined) as never,
    },
  });
}

/**
 * Who/what is resolving a secret, for audit-on-resolve (Domain 7 P1). Passed ONLY at real USE sites
 * (run injection), NOT the presence-check/listing paths — auditing those would spam the ledger (the
 * Phase-1 note). When present, resolveEnvForAgent writes one `injected` event per resolved binding.
 */
export interface SecretConsumerContext {
  actorType: "user" | "agent" | "system";
  actorId?: string | null;
  consumerType: string; // "agent" | "environment" | "system"
  consumerId: string;
  runId?: string | null;
}

export interface CreateSecretInput {
  workspaceId: string;
  name: string;
  value: string;
  description?: string | null;
  providerId?: string | null;
  personal?: boolean;
  createdBy: string;
}

/** An actor for secret-management authorization. */
export interface SecretActor {
  userId: string;
  role: string;
}

/**
 * Who may manage a secret: a PERSONAL secret only by its owner (createdBy); a WORKSPACE secret only
 * by an admin/owner. Pure — the single source of truth reused by every mutating secret op.
 */
export function canManageSecret(
  secret: { personal: boolean; createdBy: string | null },
  actor: SecretActor,
): boolean {
  if (secret.personal) return secret.createdBy === actor.userId;
  return actor.role === "admin" || actor.role === "owner";
}

export async function createSecret(input: CreateSecretInput): Promise<Secret> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  if (!input.value) badRequest("value is required");
  const dup = await prisma.secret.findFirst({
    where: { workspaceId: input.workspaceId, name },
  });
  if (dup) badRequest(`a secret named "${name}" already exists in this workspace`);

  // A provider, if given, must belong to this workspace (never bind to another tenant's backend).
  if (input.providerId) {
    const provider = await prisma.secretProviderConfig.findFirst({
      where: { id: input.providerId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!provider) badRequest("provider not found in this workspace");
  }

  const ciphertext = encryptSecret(input.value);
  const secret = await prisma.$transaction(async (tx) => {
    const s = await tx.secret.create({
      data: {
        workspaceId: input.workspaceId,
        name,
        description: input.description ?? null,
        providerId: input.providerId ?? null,
        personal: input.personal ?? false,
        currentVersion: 1,
        createdBy: input.createdBy,
      },
    });
    await tx.secretVersion.create({
      data: {
        secretId: s.id,
        version: 1,
        ciphertext,
        keyId: CURRENT_KEY_ID,
        createdBy: input.createdBy,
      },
    });
    return s;
  });
  await recordSecretAccess({
    secretId: secret.id,
    action: "created",
    actorType: "user",
    actorId: input.createdBy,
    version: 1,
  });
  return secret;
}

export interface ImportSecretsResult {
  created: number;
  skipped: number; // already existed and overwrite=false
  rotated: number; // already existed and overwrite=true → new version appended
}

/**
 * Bulk-import name/value pairs (e.g. a pasted .env). Each is created; on a name collision the entry
 * is either skipped or rotated (new version) per `overwrite`. Plaintext values are encrypted on the
 * way in exactly like createSecret/rotateSecret — none are logged or returned.
 */
export async function importSecrets(args: {
  workspaceId: string;
  createdBy: string;
  entries: { name: string; value: string }[];
  overwrite?: boolean;
}): Promise<ImportSecretsResult> {
  const result: ImportSecretsResult = { created: 0, skipped: 0, rotated: 0 };
  for (const raw of args.entries) {
    const name = raw.name.trim();
    if (!name || !raw.value) continue; // ignore empties defensively
    const existing = await prisma.secret.findFirst({
      where: { workspaceId: args.workspaceId, name },
      select: { id: true },
    });
    if (existing) {
      if (!args.overwrite) {
        result.skipped++;
        continue;
      }
      await rotateSecret({
        workspaceId: args.workspaceId,
        secretId: existing.id,
        value: raw.value,
        createdBy: args.createdBy,
      });
      result.rotated++;
      continue;
    }
    await createSecret({
      workspaceId: args.workspaceId,
      createdBy: args.createdBy,
      name,
      value: raw.value,
    });
    result.created++;
  }
  return result;
}

/** Load a secret scoped to its workspace; 404 for missing / cross-workspace ids. */
async function findScopedSecret(secretId: string, workspaceId: string): Promise<Secret> {
  const secret = await prisma.secret.findFirst({ where: { id: secretId, workspaceId } });
  if (!secret) throw new GraphQLError("Secret not found", { extensions: { code: "NOT_FOUND" } });
  return secret;
}

function forbidden(): never {
  throw new GraphQLError("Not authorized to manage this secret", {
    extensions: { code: "FORBIDDEN" },
  });
}

/** Load a secret AND authorize the actor to manage it (owner for personal, admin for workspace). */
async function loadManageableSecret(
  secretId: string,
  workspaceId: string,
  actor: SecretActor,
): Promise<Secret> {
  const secret = await findScopedSecret(secretId, workspaceId);
  if (!canManageSecret(secret, actor)) forbidden();
  return secret;
}

/** Where-clause for the secrets a member may SEE: all workspace secrets + only their own personal. */
export function visibleSecretsWhere(userId: string): Record<string, unknown> {
  return { OR: [{ personal: false }, { personal: true, createdBy: userId }] };
}

/** Edit a secret's metadata (name/description) — never touches the encrypted value. */
export async function updateSecret(
  workspaceId: string,
  secretId: string,
  patch: { name?: string | null; description?: string | null },
  actor: SecretActor,
): Promise<Secret> {
  await loadManageableSecret(secretId, workspaceId, actor);
  const name = patch.name?.trim();
  if (patch.name != null && !name) badRequest("name cannot be empty");
  return prisma.secret.update({
    where: { id: secretId },
    data: {
      ...(name ? { name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    },
  });
}

/**
 * Lifecycle: active | disabled | archived. Only `active` secrets resolve into an agent's env, so
 * disabling instantly cuts off a leaked or rotated-out credential without deleting its history.
 */
export async function setSecretStatus(
  workspaceId: string,
  secretId: string,
  status: "active" | "disabled" | "archived",
  actor: SecretActor,
): Promise<Secret> {
  await loadManageableSecret(secretId, workspaceId, actor);
  return prisma.secret.update({ where: { id: secretId }, data: { status } });
}

/** Rotate: append version N+1, retire the prior, repoint currentVersion. Reversible via history. */
export async function rotateSecret(args: {
  workspaceId: string;
  secretId: string;
  value: string;
  createdBy: string;
  actor?: SecretActor;
}): Promise<Secret> {
  if (!args.value) badRequest("value is required");
  const secret = await prisma.secret.findFirst({
    where: { id: args.secretId, workspaceId: args.workspaceId },
  });
  if (!secret) throw new GraphQLError("Secret not found", { extensions: { code: "NOT_FOUND" } });
  // actor is optional so internal callers (bulk import) keep working; when present, enforce it.
  if (args.actor && !canManageSecret(secret, args.actor)) forbidden();

  const nextVersion = secret.currentVersion + 1;
  const ciphertext = encryptSecret(args.value);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.secretVersion.updateMany({
      where: { secretId: secret.id, version: secret.currentVersion, retiredAt: null },
      data: { retiredAt: new Date() },
    });
    await tx.secretVersion.create({
      data: {
        secretId: secret.id,
        version: nextVersion,
        ciphertext,
        keyId: CURRENT_KEY_ID,
        createdBy: args.createdBy,
      },
    });
    return tx.secret.update({
      where: { id: secret.id },
      data: { currentVersion: nextVersion },
    });
  });
  await recordSecretAccess({
    secretId: secret.id,
    action: "rotated",
    actorType: "user",
    actorId: args.createdBy,
    version: nextVersion,
  });
  return updated;
}

/**
 * Decrypt a secret's value. SERVER-ONLY — never exposed through GraphQL/REST except the audited
 * one-shot reveal/inject paths (a later slice). Loads the pinned version or the current one.
 */
export async function getDecrypted(
  workspaceId: string,
  secretId: string,
  version?: number | null,
): Promise<{ value: string; version: number } | null> {
  const secret = await prisma.secret.findFirst({ where: { id: secretId, workspaceId } });
  if (!secret) return null;
  const v = version ?? secret.currentVersion;

  // External backend (Domain 7 P2): a secret bound to an aws/vault provider is fetched from that
  // store, NOT the local envelope. Credentials in the provider config are themselves workspace
  // secrets (resolved by name). A shaped failure surfaces as null - never a raw provider throw.
  if (secret.providerId) {
    const provider = await prisma.secretProviderConfig.findFirst({
      where: { id: secret.providerId, workspaceId },
    });
    const mod = provider ? getSecretProviderModule(provider.kind) : undefined;
    if (provider && mod?.implemented && (provider.kind === "aws" || provider.kind === "vault")) {
      const result = await resolveExternalSecret(provider.kind, {
        config: (provider.config ?? {}) as Record<string, unknown>,
        secretName: secret.name,
        resolveSecret: (name) => resolveWorkspaceSecret(workspaceId, name),
      });
      return result.ok ? { value: result.value, version: v } : null;
    }
  }

  const row = await prisma.secretVersion.findUnique({
    where: { secretId_version: { secretId, version: v } },
  });
  if (!row) return null;
  return { value: decryptSecret(row.ciphertext), version: v };
}

/**
 * Resolve a workspace secret's plaintext by NAME (SERVER-ONLY). Used to inject BYO cloud-provider
 * credentials (e.g. a workspace's own E2B_API_KEY) into a sandbox provision at run time. Returns null
 * when the workspace has no active secret with that name. Does NOT go through the audited human-reveal
 * path — it's the internal inject path, same trust level as resolveEnvForAgent.
 */
export async function resolveWorkspaceSecret(
  workspaceId: string,
  name: string,
  consumer?: SecretConsumerContext,
): Promise<string | null> {
  const secret = await prisma.secret.findFirst({
    where: { workspaceId, name, status: "active" },
    select: { id: true },
  });
  if (!secret) return null;
  const decrypted = await getDecrypted(workspaceId, secret.id);
  const value = decrypted?.value ?? null;
  // Audit-on-resolve (Domain 7 A3): EVERY resolve of a stored secret is recorded, not just agent
  // env-injection — so BYO creds / git tokens / plugin+environment config resolves leave a trail too.
  // Best-effort: audit must never break the resolve. Pass a `consumer` at real use sites for provenance.
  await recordSecretAccess({
    secretId: secret.id,
    action: "read",
    actorType: consumer?.actorType ?? "system",
    actorId: consumer?.actorId ?? null,
    consumerType: consumer?.consumerType ?? "system",
    consumerId: consumer?.consumerId ?? "server",
    configPath: name,
    outcome: value != null ? "resolved" : "decrypt_failed",
    runId: consumer?.runId ?? null,
  }).catch(() => {});
  return value;
}

export async function bindSecret(args: {
  workspaceId: string;
  secretId: string;
  scope: "agent" | "adapter";
  agentId?: string | null;
  adapterType?: string | null;
  envVarName: string;
  pinnedVersion?: number | null;
  createdBy: string;
  actor?: SecretActor;
}): Promise<SecretBinding> {
  const envVarName = args.envVarName.trim();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(envVarName))
    badRequest("envVarName must be a valid UPPER_SNAKE env var name");
  if (args.scope === "agent" && !args.agentId)
    badRequest("agentId required for agent-scoped binding");
  if (args.scope === "adapter" && !args.adapterType)
    badRequest("adapterType required for adapter-scoped binding");

  const secret = await prisma.secret.findFirst({
    where: { id: args.secretId, workspaceId: args.workspaceId },
  });
  if (!secret) throw new GraphQLError("Secret not found", { extensions: { code: "NOT_FOUND" } });
  // Only the owner may bind a personal secret; workspace secrets require admin. Prevents an admin
  // from routing someone else's private credential into an agent (and vice-versa).
  if (args.actor && !canManageSecret(secret, args.actor)) forbidden();

  // Agent-scoped bindings must target an agent in the same workspace.
  if (args.scope === "agent") {
    const agent = await prisma.agent.findFirst({
      where: { id: args.agentId!, workspaceId: args.workspaceId },
      select: { id: true },
    });
    if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });
  }

  const binding = await prisma.secretBinding.create({
    data: {
      secretId: secret.id,
      scope: args.scope,
      agentId: args.scope === "agent" ? args.agentId : null,
      adapterType: args.scope === "adapter" ? args.adapterType : null,
      envVarName,
      pinnedVersion: args.pinnedVersion ?? null,
      createdBy: args.createdBy,
    },
  });
  await recordSecretAccess({
    secretId: secret.id,
    action: "bound",
    actorType: "user",
    actorId: args.createdBy,
    agentId: binding.agentId,
    metadata: { envVarName, scope: args.scope },
  });
  return binding;
}

export async function unbindSecret(
  workspaceId: string,
  bindingId: string,
  actorId: string,
  actor?: SecretActor,
): Promise<boolean> {
  // Join through the secret to enforce workspace isolation on the binding.
  const binding = await prisma.secretBinding.findFirst({
    where: { id: bindingId, secret: { workspaceId } },
    include: { secret: { select: { personal: true, createdBy: true } } },
  });
  if (!binding) return false;
  if (actor && !canManageSecret(binding.secret, actor)) forbidden();
  await prisma.secretBinding.delete({ where: { id: binding.id } });
  await recordSecretAccess({
    secretId: binding.secretId,
    action: "unbound",
    actorType: "user",
    actorId,
    agentId: binding.agentId,
    metadata: { envVarName: binding.envVarName },
  });
  return true;
}

/** Pure precedence merge: agent-scoped bindings win over adapter-scoped on the same env var. */
export function mergeEnvBindings(
  entries: { envVarName: string; value: string; scope: "agent" | "adapter" }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  // Apply adapter first, then agent so agent overrides.
  for (const e of entries.filter((x) => x.scope === "adapter")) out[e.envVarName] = e.value;
  for (const e of entries.filter((x) => x.scope === "agent")) out[e.envVarName] = e.value;
  return out;
}

/**
 * Resolve the decrypted env vars an agent should receive: its own agent-scoped bindings plus the
 * adapter-scoped bindings for its adapterType, honoring each binding's pinnedVersion. Agent-scoped
 * wins on conflict. SERVER-ONLY — consumed by the (deferred) runtime injection path.
 */
export async function resolveEnvForAgent(
  workspaceId: string,
  agentId: string,
  consumer?: SecretConsumerContext,
): Promise<Record<string, string>> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    select: { id: true, adapterType: true },
  });
  if (!agent) return {};

  const bindings = await prisma.secretBinding.findMany({
    where: {
      OR: [
        { agentId: agent.id },
        ...(agent.adapterType
          ? [{ scope: "adapter" as const, adapterType: agent.adapterType }]
          : []),
      ],
      // Only active secrets resolve — a disabled/archived secret is instantly cut off from agents.
      secret: { workspaceId, status: "active" },
    },
    include: { secret: { select: { currentVersion: true } } },
  });

  const entries: { envVarName: string; value: string; scope: "agent" | "adapter" }[] = [];
  for (const b of bindings) {
    const version = b.pinnedVersion ?? b.secret.currentVersion;
    const row = await prisma.secretVersion.findUnique({
      where: { secretId_version: { secretId: b.secretId, version } },
    });
    // Audit-on-resolve at the USE site (Domain 7 P1): write one event per binding — `injected` on
    // success, `missing` when the pinned version row is gone. Best-effort; never block the run.
    if (consumer) {
      await recordSecretAccess({
        secretId: b.secretId,
        action: "injected",
        actorType: consumer.actorType,
        actorId: consumer.actorId ?? null,
        agentId: agent.id,
        version,
        consumerType: consumer.consumerType,
        consumerId: consumer.consumerId,
        configPath: `env.${b.envVarName}`,
        outcome: row ? "success" : "missing",
        errorCode: row ? null : "version_not_found",
        runId: consumer.runId ?? null,
      }).catch(() => {});
    }
    if (!row) continue;
    entries.push({
      envVarName: b.envVarName,
      value: decryptSecret(row.ciphertext),
      scope: b.scope,
    });
  }
  return mergeEnvBindings(entries);
}

// ─── Provider configs ─────────────────────────────────────────────
// A SecretProviderConfig points the vault at an external backend (aws/vault) or the default local
// envelope (env). `config` holds only NON-secret settings (region, path prefix); the backend's own
// credentials are themselves Secrets. Nothing here ever stores or returns a plaintext secret.
const PROVIDER_KINDS: SecretProviderKind[] = ["env", "aws", "vault"];

export function isSecretProviderKind(v: string): v is SecretProviderKind {
  return (PROVIDER_KINDS as string[]).includes(v);
}

export async function createSecretProvider(input: {
  workspaceId: string;
  name: string;
  kind: SecretProviderKind;
  config?: Record<string, unknown> | null;
}): Promise<SecretProviderConfig> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  const dup = await prisma.secretProviderConfig.findFirst({
    where: { workspaceId: input.workspaceId, name },
  });
  if (dup) badRequest(`a provider named "${name}" already exists in this workspace`);
  // Domain 7 P2: a provider may be created then configured — config completeness is surfaced by the
  // health check (checkSecretProviderHealth), not enforced here, so a bare provider row is allowed.
  return prisma.secretProviderConfig.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      kind: input.kind,
      config: (input.config ?? {}) as never,
    },
  });
}

export function listSecretProviders(workspaceId: string) {
  return prisma.secretProviderConfig.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
  });
}

/**
 * Run a provider's health check (Domain 7 P2) and PERSIST the outcome onto healthy/lastCheckedAt/
 * lastError — fields the model has always had but nothing ever wrote. Pure module logic lives in
 * @agentcenter/utils; env is healthy, aws/vault report `coming_soon` until a real resolver lands.
 */
export async function checkSecretProviderHealth(
  workspaceId: string,
  id: string,
): Promise<SecretProviderConfig> {
  const provider = await prisma.secretProviderConfig.findFirst({ where: { id, workspaceId } });
  if (!provider) notFound("Provider");
  const health = checkSecretProviderConfigHealth(
    provider.kind,
    (provider.config ?? {}) as Record<string, unknown>,
  );
  return prisma.secretProviderConfig.update({
    where: { id: provider.id },
    data: { healthy: health.healthy, lastCheckedAt: new Date(), lastError: health.error },
  });
}

/** Delete a provider. Its secrets are NOT deleted — providerId is SetNull, falling back to local. */
export async function deleteSecretProvider(workspaceId: string, id: string): Promise<boolean> {
  const provider = await prisma.secretProviderConfig.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!provider) notFound("Provider");
  await prisma.secretProviderConfig.delete({ where: { id: provider.id } });
  return true;
}
