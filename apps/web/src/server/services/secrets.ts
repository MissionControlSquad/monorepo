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

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}

/** Append a secret access-event (audit). Centralized so no path skips the log. */
export function recordSecretAccess(input: {
  secretId: string;
  action: SecretAccessAction;
  actorType: "user" | "agent" | "system";
  actorId?: string | null;
  agentId?: string | null;
  version?: number | null;
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
      metadata: (input.metadata ?? undefined) as never,
    },
  });
}

export interface CreateSecretInput {
  workspaceId: string;
  name: string;
  value: string;
  description?: string | null;
  providerId?: string | null;
  createdBy: string;
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

/** Edit a secret's metadata (name/description) — never touches the encrypted value. */
export async function updateSecret(
  workspaceId: string,
  secretId: string,
  patch: { name?: string | null; description?: string | null },
): Promise<Secret> {
  await findScopedSecret(secretId, workspaceId);
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
): Promise<Secret> {
  await findScopedSecret(secretId, workspaceId);
  return prisma.secret.update({ where: { id: secretId }, data: { status } });
}

/** Rotate: append version N+1, retire the prior, repoint currentVersion. Reversible via history. */
export async function rotateSecret(args: {
  workspaceId: string;
  secretId: string;
  value: string;
  createdBy: string;
}): Promise<Secret> {
  if (!args.value) badRequest("value is required");
  const secret = await prisma.secret.findFirst({
    where: { id: args.secretId, workspaceId: args.workspaceId },
  });
  if (!secret) throw new GraphQLError("Secret not found", { extensions: { code: "NOT_FOUND" } });

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
  const row = await prisma.secretVersion.findUnique({
    where: { secretId_version: { secretId, version: v } },
  });
  if (!row) return null;
  return { value: decryptSecret(row.ciphertext), version: v };
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
): Promise<boolean> {
  // Join through the secret to enforce workspace isolation on the binding.
  const binding = await prisma.secretBinding.findFirst({
    where: { id: bindingId, secret: { workspaceId } },
  });
  if (!binding) return false;
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
