/**
 * User-scoped secret definitions + declarations + coverage (parity §3 #7).
 *
 * A DEFINITION is workspace-level ("this workspace expects each member to provide credential X",
 * e.g. GITHUB_TOKEN) and holds NO value. A DECLARATION is a single member's fulfilment of one
 * definition; when provided it points at a personal `Secret` that holds the value as AES-256-GCM
 * ciphertext — reusing the EXACT encryption path (createSecret/rotateSecret → encryptSecret) and the
 * EXACT audit path (recordSecretAccess) of the secrets vault. Plaintext is never stored or returned
 * here. Coverage = how many required definitions a member has fulfilled vs. is missing.
 *
 * ── How to test (manual) ─────────────────────────────────────────────────────────────────────
 *  1. Admin (owner/admin role) adds a required definition:
 *       createUserSecretDefinition({ key: "GITHUB_TOKEN", displayName: "GitHub token", required: true })
 *  2. A member provides it for themselves:
 *       declareUserSecret({ definitionId, value: "ghp_xxx" })  // value encrypted, no plaintext at rest
 *  3. Coverage flips missing → provided:
 *       getUserSecretCoverage({ profileId: <member> })  // provided:1 missing:0 for that member
 *  4. Gates: with SECRETS_VAULT off every op 4xx/errors; a member cannot create/delete a definition
 *     (admin-only); a member can only declare/read their OWN coverage (self-scoped).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { UserSecretDefinition, UserSecretDeclaration } from "@agentcenter/database";
import { createSecret, rotateSecret, recordSecretAccess } from "./secrets";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}

/** UPPER_SNAKE env-var-style keys, matching the vault's envVarName convention. */
const KEY_RE = /^[A-Z_][A-Z0-9_]*$/;

/**
 * The name of the personal Secret backing a member's declaration. Namespaced per member so two
 * members can each provide the same key without colliding on the vault's unique (workspaceId, name).
 */
export function declarationSecretName(profileId: string, key: string): string {
  return `usersecret:${profileId}:${key}`;
}

// ─── Definitions (admin-managed) ──────────────────────────────────────────────────────────────

export function listUserSecretDefinitions(workspaceId: string): Promise<UserSecretDefinition[]> {
  return prisma.userSecretDefinition.findMany({
    where: { workspaceId },
    orderBy: [{ required: "desc" }, { key: "asc" }],
  });
}

export async function createUserSecretDefinition(input: {
  workspaceId: string;
  key: string;
  displayName: string;
  description?: string | null;
  required?: boolean;
  createdByProfileId: string;
}): Promise<UserSecretDefinition> {
  const key = input.key.trim();
  if (!KEY_RE.test(key)) badRequest("key must be a valid UPPER_SNAKE credential name");
  const displayName = input.displayName.trim() || key;
  const dup = await prisma.userSecretDefinition.findFirst({
    where: { workspaceId: input.workspaceId, key },
    select: { id: true },
  });
  if (dup) badRequest(`a secret definition "${key}" already exists in this workspace`);
  return prisma.userSecretDefinition.create({
    data: {
      workspaceId: input.workspaceId,
      key,
      displayName,
      description: input.description?.trim() || null,
      required: input.required ?? true,
      createdByProfileId: input.createdByProfileId,
    },
  });
}

/** Delete a definition (and its declarations, via cascade). Workspace-scoped. */
export async function deleteUserSecretDefinition(
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const def = await prisma.userSecretDefinition.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!def) notFound("Secret definition");
  await prisma.userSecretDefinition.delete({ where: { id: def.id } });
  return true;
}

// ─── Declarations (self-service) ──────────────────────────────────────────────────────────────

/**
 * The current member provides (or rotates) their value for a definition. Encryption + audit are the
 * vault's: the value is stored as a personal Secret via createSecret/rotateSecret (AES-256-GCM,
 * "created"/"rotated" access events), and the declaration only records the fulfilment + a pointer to
 * that secret's current version. Never stores plaintext and never returns the value.
 */
export async function declareUserSecret(input: {
  workspaceId: string;
  definitionId: string;
  profileId: string;
  value: string;
}): Promise<UserSecretDeclaration> {
  if (!input.value) badRequest("value is required");
  const def = await prisma.userSecretDefinition.findFirst({
    where: { id: input.definitionId, workspaceId: input.workspaceId },
  });
  if (!def) notFound("Secret definition");

  const name = declarationSecretName(input.profileId, def.key);
  const existing = await prisma.secret.findFirst({
    where: { workspaceId: input.workspaceId, name },
    select: { id: true },
  });

  // Reuse the vault's write path: create the personal secret (v1) or rotate it (new version). Both
  // encrypt the value and append a SecretAccessEvent — so declarations inherit encryption + audit.
  let secretId: string;
  if (existing) {
    const rotated = await rotateSecret({
      workspaceId: input.workspaceId,
      secretId: existing.id,
      value: input.value,
      createdBy: input.profileId,
      actor: { userId: input.profileId, role: "member" },
    });
    secretId = rotated.id;
  } else {
    const created = await createSecret({
      workspaceId: input.workspaceId,
      createdBy: input.profileId,
      name,
      value: input.value,
      description: def.description ?? `Provided value for "${def.key}"`,
      personal: true,
    });
    secretId = created.id;
  }

  const secret = await prisma.secret.findUniqueOrThrow({ where: { id: secretId } });
  const version = await prisma.secretVersion.findUnique({
    where: { secretId_version: { secretId, version: secret.currentVersion } },
    select: { id: true },
  });

  return prisma.userSecretDeclaration.upsert({
    where: { definitionId_profileId: { definitionId: def.id, profileId: input.profileId } },
    create: {
      definitionId: def.id,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      secretId,
      secretVersionId: version?.id ?? null,
      status: "provided",
    },
    update: { secretId, secretVersionId: version?.id ?? null, status: "provided" },
  });
}

// ─── Coverage ─────────────────────────────────────────────────────────────────────────────────

export interface UserSecretCoverageItem {
  definitionId: string;
  key: string;
  displayName: string;
  description: string | null;
  required: boolean;
  status: "provided" | "missing";
  updatedAt: Date | null;
}

export interface UserSecretCoverage {
  profileId: string;
  /** Count of REQUIRED definitions (the coverage denominator M). */
  total: number;
  provided: number;
  missing: number;
  items: UserSecretCoverageItem[];
}

/**
 * Coverage for one member: for every definition in the workspace, is it provided or missing for that
 * member. `total`/`provided`/`missing` count only REQUIRED definitions (the "N of M" banner). Each
 * PROVIDED fulfilment records a lightweight `read` audit via recordSecretAccess (best-effort, never
 * blocks) — mirroring the vault's audit-on-resolve so a member's provided credentials leave a trail.
 */
export async function getUserSecretCoverage(input: {
  workspaceId: string;
  profileId: string;
}): Promise<UserSecretCoverage> {
  const [definitions, declarations] = await Promise.all([
    prisma.userSecretDefinition.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: [{ required: "desc" }, { key: "asc" }],
    }),
    prisma.userSecretDeclaration.findMany({
      where: { workspaceId: input.workspaceId, profileId: input.profileId, status: "provided" },
    }),
  ]);
  const byDef = new Map(declarations.map((d) => [d.definitionId, d]));

  const items: UserSecretCoverageItem[] = definitions.map((def) => {
    const decl = byDef.get(def.id);
    const provided = Boolean(decl && decl.secretId);
    return {
      definitionId: def.id,
      key: def.key,
      displayName: def.displayName,
      description: def.description,
      required: def.required,
      status: provided ? "provided" : "missing",
      updatedAt: decl?.updatedAt ?? null,
    };
  });

  // Audit reads: one best-effort `read` event per provided declaration (reuses recordSecretAccess).
  for (const decl of declarations) {
    if (!decl.secretId) continue;
    await recordSecretAccess({
      secretId: decl.secretId,
      action: "read",
      actorType: "user",
      actorId: input.profileId,
      configPath: "user-secret-coverage",
    }).catch(() => {});
  }

  const requiredItems = items.filter((i) => i.required);
  const provided = requiredItems.filter((i) => i.status === "provided").length;
  return {
    profileId: input.profileId,
    total: requiredItems.length,
    provided,
    missing: requiredItems.length - provided,
    items,
  };
}
