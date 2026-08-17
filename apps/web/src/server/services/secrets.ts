/**
 * Secrets vault service (Epic #5). Workspace-scoped. Values are stored ONLY as AES-256-GCM
 * ciphertext; plaintext is accepted on write and produced on the server-only resolve path, never
 * returned via the public API and never persisted/logged in the clear. Every state change writes an
 * append-only SecretAccessEvent.
 */
import { GraphQLError } from "graphql";
import type { WorkspaceRole } from "@agentcenter/graphql-server";
import { isManagerRole } from "@/server/tenancy/roles";
import { prisma } from "@/server/prisma";
import type {
  Secret,
  SecretBinding,
  SecretBindingScope,
  SecretAccessAction,
  SecretProviderConfig,
  SecretProviderKind,
} from "@agentcenter/database";
import { encryptSecret, decryptSecret, CURRENT_KEY_ID } from "./secrets-crypto";
import {
  checkSecretProviderConfigHealth,
  getSecretProviderModule,
  validateSecretProviderConfig,
} from "@agentcenter/utils";
import {
  resolveExternalSecret,
  writeExternalSecret,
  type ExternalWriteResult,
  type AwsClientFactory,
  type FetchImpl,
} from "./secret-external";
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
  // actor.role is a plain string here (SecretActor); the cast is safe — a non-role value ranks below
  // admin and fails closed. isManagerRole is the canonical owner/admin idiom.
  return isManagerRole(actor.role as WorkspaceRole);
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
  scope: SecretBindingScope;
  agentId?: string | null;
  adapterType?: string | null;
  toolConnectionId?: string | null;
  envVarName: string;
  pinnedVersion?: number | null;
  // Richer bindings (parity §3 secrets depth) — additive, safe defaults reproduce legacy behavior.
  configPath?: string | null;
  versionSelector?: string | null;
  projectionClass?: string | null;
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
  if (args.scope === "tool_connection" && !args.toolConnectionId)
    badRequest("toolConnectionId required for tool_connection-scoped binding");

  // Projection class (how the value is projected) + version selector validation. Defaults keep an
  // existing/omitted binding on the legacy env-var, latest-version path.
  const projectionClass = args.projectionClass?.trim() || "env";
  if (!isProjectionClass(projectionClass))
    badRequest("projectionClass must be one of: env, file, inline_ref");
  const versionSelector = normalizeVersionSelector(args.versionSelector);
  // configPath targets WHERE the value lands: a dotted path into the target's config JSON (e.g.
  // "auth.token", "hooks[].secret") for inline_ref, or a relative file path (e.g. "certs/tls.pem")
  // for file. Permissive but non-empty and free of whitespace / traversal. Null = flat env.
  const configPath = args.configPath?.trim() || null;
  if (
    configPath &&
    (!/^[A-Za-z0-9_][A-Za-z0-9_./\-[\]]*$/.test(configPath) || configPath.includes(".."))
  )
    badRequest(
      "configPath must be a dotted path or relative file path (e.g. auth.token, certs/tls.pem)",
    );
  // A non-env projection is meaningless without a configPath telling us WHERE to write the value.
  if (projectionClass !== "env" && !configPath)
    badRequest(`projectionClass "${projectionClass}" requires a configPath`);

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
      toolConnectionId: args.scope === "tool_connection" ? args.toolConnectionId : null,
      envVarName,
      pinnedVersion: args.pinnedVersion ?? null,
      configPath,
      versionSelector,
      projectionClass,
      createdBy: args.createdBy,
    },
  });
  await recordSecretAccess({
    secretId: secret.id,
    action: "bound",
    actorType: "user",
    actorId: args.createdBy,
    agentId: binding.agentId,
    configPath: configPath ?? `env.${envVarName}`,
    metadata: { envVarName, scope: args.scope, projectionClass, versionSelector },
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

// ─── Richer binding projection (parity §3 secrets depth) ──────────────
export const PROJECTION_CLASSES = ["env", "file", "inline_ref"] as const;
export type ProjectionClass = (typeof PROJECTION_CLASSES)[number];

export function isProjectionClass(v: string): v is ProjectionClass {
  return (PROJECTION_CLASSES as readonly string[]).includes(v);
}

const BINDING_SCOPES: SecretBindingScope[] = ["agent", "adapter", "tool_connection"];
export function isSecretBindingScope(v: string): v is SecretBindingScope {
  return (BINDING_SCOPES as string[]).includes(v);
}

/**
 * Normalize a versionSelector: "latest" (default) follows pinnedVersion ?? currentVersion; a positive
 * integer string pins that exact version. Anything else collapses to "latest" (fail-open to latest).
 */
export function normalizeVersionSelector(selector?: string | null): string {
  const s = selector?.trim();
  if (!s || s === "latest") return "latest";
  const n = Number.parseInt(s, 10);
  return Number.isInteger(n) && n > 0 ? String(n) : "latest";
}

/**
 * Pure: the concrete SecretVersion number a binding resolves to. A numeric versionSelector pins
 * explicitly and supersedes the legacy pinnedVersion; "latest" follows pinnedVersion ?? currentVersion.
 */
export function selectBindingVersion(
  binding: { versionSelector?: string | null; pinnedVersion?: number | null },
  currentVersion: number,
): number {
  const sel = binding.versionSelector?.trim();
  if (sel && sel !== "latest") {
    const n = Number.parseInt(sel, 10);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return binding.pinnedVersion ?? currentVersion;
}

/** One resolved binding: its decrypted value plus how/where to project it. */
export interface ResolvedBindingValue {
  envVarName: string;
  configPath: string | null;
  projectionClass: ProjectionClass;
  scope: SecretBindingScope;
  value: string;
}

/**
 * The full projection an agent's bindings produce, split by projectionClass:
 *   env        → environment variables (envVarName → value),
 *   files      → a file mounted at configPath with the value as its contents,
 *   inlineRefs → a value patched into the target config JSON at configPath.
 */
export interface AgentSecretProjection {
  env: Record<string, string>;
  files: { path: string; value: string }[];
  inlineRefs: { path: string; value: string }[];
}

/**
 * Pure precedence merge: agent-scoped bindings win over adapter/tool-scoped on the same env var.
 * (Kept for back-compat; `projectResolvedBindings` is the richer superset.)
 */
export function mergeEnvBindings(
  entries: { envVarName: string; value: string; scope: SecretBindingScope }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  // Apply non-agent scopes first, then agent so agent overrides.
  for (const e of entries.filter((x) => x.scope !== "agent")) out[e.envVarName] = e.value;
  for (const e of entries.filter((x) => x.scope === "agent")) out[e.envVarName] = e.value;
  return out;
}

/**
 * Pure: fan resolved bindings out into the three projection classes, honoring configPath. Agent-scoped
 * bindings win over adapter/tool on a conflicting env var (same precedence as mergeEnvBindings).
 */
export function projectResolvedBindings(entries: ResolvedBindingValue[]): AgentSecretProjection {
  const proj: AgentSecretProjection = { env: {}, files: [], inlineRefs: [] };
  // agent last so it overrides non-agent env vars on conflict.
  const ordered = [...entries].sort(
    (a, b) => Number(a.scope === "agent") - Number(b.scope === "agent"),
  );
  for (const e of ordered) {
    if (e.projectionClass === "file") {
      proj.files.push({ path: e.configPath ?? e.envVarName, value: e.value });
    } else if (e.projectionClass === "inline_ref") {
      proj.inlineRefs.push({ path: e.configPath ?? e.envVarName, value: e.value });
    } else {
      proj.env[e.envVarName] = e.value;
    }
  }
  return proj;
}

/**
 * Gather an agent's resolved bindings (agent-scoped + adapter-scoped for its adapterType), honoring
 * each binding's versionSelector/pinnedVersion and writing audit-on-resolve when a consumer is passed.
 * Shared by resolveEnvForAgent (env-only view) and resolveBindingsForAgent (full projection).
 */
async function gatherAgentBindings(
  workspaceId: string,
  agentId: string,
  consumer?: SecretConsumerContext,
): Promise<ResolvedBindingValue[]> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    select: { id: true, adapterType: true },
  });
  if (!agent) return [];

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

  const entries: ResolvedBindingValue[] = [];
  for (const b of bindings) {
    const version = selectBindingVersion(b, b.secret.currentVersion);
    const row = await prisma.secretVersion.findUnique({
      where: { secretId_version: { secretId: b.secretId, version } },
    });
    // Audit-on-resolve at the USE site (Domain 7 P1): write one event per binding — `injected` on
    // success, `missing` when the selected version row is gone. Best-effort; never block the run.
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
        configPath: b.configPath ?? `env.${b.envVarName}`,
        outcome: row ? "success" : "missing",
        errorCode: row ? null : "version_not_found",
        runId: consumer.runId ?? null,
      }).catch(() => {});
    }
    if (!row) continue;
    const projectionClass = isProjectionClass(b.projectionClass) ? b.projectionClass : "env";
    entries.push({
      envVarName: b.envVarName,
      configPath: b.configPath,
      projectionClass,
      scope: b.scope,
      value: decryptSecret(row.ciphertext),
    });
  }
  return entries;
}

/**
 * Resolve the decrypted env vars an agent should receive: its own agent-scoped bindings plus the
 * adapter-scoped bindings for its adapterType, honoring each binding's versionSelector/pinnedVersion.
 * Only env-projection bindings appear here (file/inline_ref project elsewhere). Agent-scoped wins on
 * conflict. SERVER-ONLY — consumed by the runtime injection path.
 */
export async function resolveEnvForAgent(
  workspaceId: string,
  agentId: string,
  consumer?: SecretConsumerContext,
): Promise<Record<string, string>> {
  const entries = await gatherAgentBindings(workspaceId, agentId, consumer);
  return projectResolvedBindings(entries).env;
}

/**
 * Resolve the concrete SecretVersion each of an agent's bindings points at — {secretId, version} pairs
 * — WITHOUT decrypting anything. Feeds the lease secret-version fingerprint (security hardening Item 1):
 * the fingerprint changes when any bound secret is rotated (its selected version bumps), so a reusable
 * lease provisioned with the old credential is not re-attached. Same binding set (agent + adapter scope,
 * active secrets only) as gatherAgentBindings, but version-only + no audit event (this is a preflight
 * reuse check, not a real use of the secret).
 */
export async function resolveAgentSecretVersionRefs(
  workspaceId: string,
  agentId: string,
): Promise<{ key: string; version: number }[]> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    select: { id: true, adapterType: true },
  });
  if (!agent) return [];
  const bindings = await prisma.secretBinding.findMany({
    where: {
      OR: [
        { agentId: agent.id },
        ...(agent.adapterType
          ? [{ scope: "adapter" as const, adapterType: agent.adapterType }]
          : []),
      ],
      secret: { workspaceId, status: "active" },
    },
    include: { secret: { select: { currentVersion: true } } },
  });
  return bindings.map((b) => ({
    key: b.secretId,
    version: selectBindingVersion(b, b.secret.currentVersion),
  }));
}

/**
 * Resolve the current active version of each named workspace secret (no decrypt). Feeds the lease
 * fingerprint for the environment's config/envVars secret-refs. A name with no active secret is skipped
 * (it contributes nothing to the fingerprint — a later-created secret then changes it, forcing fresh).
 */
export async function resolveNamedSecretVersionRefs(
  workspaceId: string,
  names: string[],
): Promise<{ key: string; version: number }[]> {
  if (names.length === 0) return [];
  const secrets = await prisma.secret.findMany({
    where: { workspaceId, name: { in: [...new Set(names)] }, status: "active" },
    select: { id: true, currentVersion: true },
  });
  return secrets.map((s) => ({ key: s.id, version: s.currentVersion }));
}

/**
 * Resolve the FULL projection for an agent — env vars, file mounts, and inline config patches — from
 * its bindings, honoring configPath/versionSelector/projectionClass. SERVER-ONLY. This is the richer
 * superset of resolveEnvForAgent (whose result equals the `.env` of this).
 */
export async function resolveBindingsForAgent(
  workspaceId: string,
  agentId: string,
  consumer?: SecretConsumerContext,
): Promise<AgentSecretProjection> {
  const entries = await gatherAgentBindings(workspaceId, agentId, consumer);
  return projectResolvedBindings(entries);
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

/**
 * Provider WRITE-side managed rotation (parity §3 secrets depth). Rotates a provider-backed secret
 * BY WRITING the new value to the external store (AWS PutSecretValue / Vault KV v2 write), then mirrors
 * it locally as a new SecretVersion and records a `rotated` audit event. The provider must be an
 * aws/vault provider whose non-secret config validates (configured) — otherwise this is rejected, so
 * live remote calls only ever fire against a real, configured backend. `createRemote` uses CreateSecret
 * instead of PutSecretValue (first-time provisioning). The client/fetch are injectable so tests exercise
 * the full path against a MOCKED provider (no live cloud call) — see secrets-managed-rotation.test.ts.
 */
export async function rotateManagedSecret(args: {
  workspaceId: string;
  secretId: string;
  value: string;
  createdBy: string;
  actor?: SecretActor;
  createRemote?: boolean;
  // Injected in tests so no real AWS/Vault call is made; undefined in prod → the real SDK/fetch.
  clientFactory?: AwsClientFactory;
  fetchImpl?: FetchImpl;
}): Promise<Secret> {
  if (!args.value) badRequest("value is required");
  const secret = await prisma.secret.findFirst({
    where: { id: args.secretId, workspaceId: args.workspaceId },
  });
  if (!secret) throw new GraphQLError("Secret not found", { extensions: { code: "NOT_FOUND" } });
  if (args.actor && !canManageSecret(secret, args.actor)) forbidden();

  if (!secret.providerId) badRequest("secret is not backed by an external provider");
  const provider = await prisma.secretProviderConfig.findFirst({
    where: { id: secret.providerId, workspaceId: args.workspaceId },
  });
  if (!provider) badRequest("provider not found in this workspace");
  if (provider.kind !== "aws" && provider.kind !== "vault")
    badRequest("managed rotation requires an aws or vault provider");
  // Only fire remote calls against a CONFIGURED provider (well-formed non-secret config).
  const valid = validateSecretProviderConfig(
    provider.kind,
    (provider.config ?? {}) as Record<string, unknown>,
  );
  if (!valid.ok) badRequest(`provider is not configured: ${valid.error}`);

  const write: ExternalWriteResult = await writeExternalSecret(provider.kind, {
    config: (provider.config ?? {}) as Record<string, unknown>,
    secretName: secret.name,
    value: args.value,
    mode: args.createRemote ? "create" : "rotate",
    resolveSecret: (name) => resolveWorkspaceSecret(args.workspaceId, name),
    clientFactory: args.clientFactory,
    fetchImpl: args.fetchImpl,
  });

  if (!write.ok) {
    // Shaped provider failure → audit the attempt and surface a clean error (never a raw provider throw).
    await recordSecretAccess({
      secretId: secret.id,
      action: "rotated",
      actorType: "user",
      actorId: args.createdBy,
      outcome: "provider_error",
      errorCode: write.code,
      metadata: { provider: provider.name, kind: provider.kind, error: write.error },
    }).catch(() => {});
    throw new GraphQLError(`Provider rotation failed: ${write.error}`, {
      extensions: { code: "PROVIDER_ERROR", providerCode: write.code },
    });
  }

  // Mirror the new value locally as version N+1 (retire the prior) so history + audit stay complete
  // even for provider-backed secrets, then repoint currentVersion.
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
    outcome: "success",
    metadata: {
      provider: provider.name,
      kind: provider.kind,
      mode: args.createRemote ? "create" : "rotate",
      remoteVersion: write.version ?? null,
    },
  });
  return updated;
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
