/**
 * Tier D / Phase 3 (Plan 5) — custom sandbox image capture. Snapshot a freshly-provisioned box into a
 * reusable image template that future runs boot from (via SandboxSpec.image). At most one ACTIVE
 * template per (environment, provider); capturing a new one supersedes the prior (the supersede chain).
 * The captured image records the config fingerprint it was built from, so config drift can be
 * classified none/relinkable/breaking (custom-image-policy).
 *
 * The interactive setup-terminal flow (Paperclip setup sessions) is DEFERRED — it needs a live SSH PTY
 * into a setup box. Capture here snapshots a plain provisioned box.
 *
 * Security: CUSTOM_IMAGES-flag-gated + admin at the GraphQL layer; workspace-scoped; provider creds are
 * BYO from the vault (via the provision ctx).
 */
import { GraphQLError } from "graphql";
import { fingerprintProviderConfig, classifyConfigChange } from "@agentcenter/utils";
import type { EnvironmentCustomImageTemplate, Prisma } from "@agentcenter/database";
import { prisma } from "@/server/prisma";
import { getSandboxProvider } from "./sandbox-providers";
import { resolveWorkspaceSecret } from "./secrets";

function notFound(msg = "Environment not found"): never {
  throw new GraphQLError(msg, { extensions: { code: "NOT_FOUND" } });
}

function leaseCtx(workspaceId: string) {
  return {
    workspaceId,
    resolveSecret: (name: string) => resolveWorkspaceSecret(workspaceId, name),
  };
}

/** The active image template for an environment+provider, if any. */
export function getActiveTemplate(
  environmentId: string,
  provider: string,
): Promise<EnvironmentCustomImageTemplate | null> {
  return prisma.environmentCustomImageTemplate.findFirst({
    where: { environmentId, provider, status: "active" },
  });
}

/**
 * The image ref a run should boot from for this environment+provider, or null. Bumps lastUsedAt.
 * Returns null unless CUSTOM_IMAGES applies — callers gate on the flag before calling.
 */
export async function resolveActiveImageRef(
  environmentId: string,
  provider: string,
): Promise<string | null> {
  const t = await getActiveTemplate(environmentId, provider);
  if (!t) return null;
  await prisma.environmentCustomImageTemplate
    .update({ where: { id: t.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return t.templateRef;
}

export function listTemplates(workspaceId: string, environmentId: string) {
  return prisma.environmentCustomImageTemplate.findMany({
    where: { workspaceId, environmentId },
    orderBy: { capturedAt: "desc" },
    take: 50,
  });
}

/**
 * Capture the environment's sandbox config into a new active image: provision a box, snapshot it, then
 * destroy it. Supersedes any prior active template. Requires the provider to support `snapshot`.
 */
export async function captureCustomImage(
  workspaceId: string,
  environmentId: string,
  createdByProfileId?: string | null,
): Promise<EnvironmentCustomImageTemplate> {
  const env = await prisma.environment.findFirst({ where: { id: environmentId, workspaceId } });
  if (!env) notFound();
  if (env.driver !== "sandbox") {
    throw new GraphQLError("Custom images are only supported for sandbox-driver environments", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  const config = (env.config ?? {}) as Record<string, unknown>;
  const providerKey = String(config.provider ?? "");
  const provider = getSandboxProvider(providerKey);
  if (!provider) {
    throw new GraphQLError(`Unknown sandbox provider: ${providerKey}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  if (!provider.snapshot) {
    throw new GraphQLError(`Provider "${providerKey}" does not support image capture`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const ctx = leaseCtx(workspaceId);
  const handle = await provider.provision(ctx);
  let snap: { templateRef: string; templateKind: string };
  try {
    snap = await provider.snapshot(handle, ctx);
  } finally {
    await handle.destroy().catch(() => {});
  }

  // Supersede the prior active template + insert the new one atomically.
  const fingerprint = fingerprintProviderConfig(config);
  return prisma.$transaction(async (tx) => {
    const prior = await tx.environmentCustomImageTemplate.findFirst({
      where: { environmentId, provider: providerKey, status: "active" },
    });
    // Demote the prior active template BEFORE inserting the new one. A partial unique index
    // — (environmentId, provider) WHERE status = 'active' — permits only one active row per
    // env+provider, so two active rows (even momentarily inside this txn) violate it. The
    // supersededByTemplateId back-pointer is stamped in a second update once `created` exists.
    if (prior) {
      await tx.environmentCustomImageTemplate.update({
        where: { id: prior.id },
        data: { status: "superseded" },
      });
    }
    const created = await tx.environmentCustomImageTemplate.create({
      data: {
        workspaceId,
        environmentId,
        provider: providerKey,
        templateKind: snap.templateKind,
        templateRef: snap.templateRef,
        sourceConfigFingerprint: fingerprint,
        status: "active",
        // Store the full capture config so a later drift can be classified precisely.
        metadata: { captureConfig: config } as Prisma.InputJsonValue,
        createdByProfileId: createdByProfileId ?? null,
      },
    });
    if (prior) {
      await tx.environmentCustomImageTemplate.update({
        where: { id: prior.id },
        data: { supersededByTemplateId: created.id },
      });
    }
    return created;
  });
}

/** Roll back to a superseded/disabled template: make it active again (superseding the current active). */
export async function rollbackToTemplate(
  workspaceId: string,
  templateId: string,
): Promise<EnvironmentCustomImageTemplate> {
  const target = await prisma.environmentCustomImageTemplate.findFirst({
    where: { id: templateId, workspaceId },
  });
  if (!target) notFound("Template not found");
  return prisma.$transaction(async (tx) => {
    const current = await tx.environmentCustomImageTemplate.findFirst({
      where: { environmentId: target.environmentId, provider: target.provider, status: "active" },
    });
    if (current && current.id !== target.id) {
      await tx.environmentCustomImageTemplate.update({
        where: { id: current.id },
        data: { status: "superseded", supersededByTemplateId: target.id },
      });
    }
    return tx.environmentCustomImageTemplate.update({
      where: { id: target.id },
      data: { status: "active", supersededByTemplateId: null },
    });
  });
}

/** Disable a template (no longer usable; frees the active slot if it was active). */
export async function disableTemplate(workspaceId: string, templateId: string): Promise<boolean> {
  const t = await prisma.environmentCustomImageTemplate.findFirst({
    where: { id: templateId, workspaceId },
  });
  if (!t) notFound("Template not found");
  await prisma.environmentCustomImageTemplate.update({
    where: { id: t.id },
    data: { status: "disabled" },
  });
  return true;
}

/** Classify how the environment's CURRENT config drifted from the active template's capture config. */
export async function classifyActiveTemplateDrift(
  workspaceId: string,
  environmentId: string,
): Promise<{ change: "none" | "relinkable" | "breaking"; hasActive: boolean }> {
  const env = await prisma.environment.findFirst({ where: { id: environmentId, workspaceId } });
  if (!env) notFound();
  const config = (env.config ?? {}) as Record<string, unknown>;
  const active = await getActiveTemplate(environmentId, String(config.provider ?? ""));
  const captureConfig = (active?.metadata as { captureConfig?: unknown } | null)?.captureConfig;
  if (!active || captureConfig === undefined) return { change: "none", hasActive: !!active };
  return { change: classifyConfigChange(captureConfig, config), hasActive: true };
}
