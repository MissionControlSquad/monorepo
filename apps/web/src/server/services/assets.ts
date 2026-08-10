import { prisma } from "@/server/prisma";
import type { Asset } from "@agentcenter/database";
import { generateUploadUrl, generateDownloadUrl, deleteFile } from "@/server/storage/r2";
import { badRequest } from "./service-errors";

// Asset store (parity #15 / #27). Metadata + R2-pointer for uploaded workspace assets. Two-step upload:
// createAssetUploadUrl (presigned PUT) → client uploads → recordAsset (persist the row). Company
// artifacts (#27) are assets with ownerType="company". Content lives in R2; this service owns the
// metadata. ASSETS-flag-gated at the resolver.

const KINDS = new Set(["image", "document", "archive", "binary", "other"]);
const OWNER_TYPES = new Set(["company", "agent", "project", "task"]);

/** Presigned direct-to-R2 upload target under the assets/ prefix. Client PUTs, then calls recordAsset. */
export function createAssetUploadUrl(
  fileName: string,
  mimeType: string,
): Promise<{ key: string; uploadUrl: string }> {
  if (!fileName?.trim()) badRequest("fileName is required");
  if (!mimeType?.trim()) badRequest("mimeType is required");
  return generateUploadUrl(fileName, mimeType, "assets");
}

/** Persist the asset row after the client has uploaded to `storageKey`. */
export async function recordAsset(input: {
  workspaceId: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes?: number;
  storageKey: string;
  ownerType?: string | null;
  ownerId?: string | null;
  metadata?: unknown;
  uploadedByProfileId?: string | null;
}): Promise<Asset> {
  if (!input.name?.trim()) badRequest("name is required");
  if (!KINDS.has(input.kind)) badRequest(`unknown asset kind '${input.kind}'`);
  if (!input.storageKey?.trim()) badRequest("storageKey is required");
  if (input.ownerType != null) {
    if (!OWNER_TYPES.has(input.ownerType)) badRequest(`unknown ownerType '${input.ownerType}'`);
    if (!input.ownerId?.trim()) badRequest("ownerId is required when ownerType is set");
  }
  return prisma.asset.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes: Math.max(0, Math.round(input.sizeBytes ?? 0)),
      storageKey: input.storageKey,
      ownerType: input.ownerType ?? null,
      ownerId: input.ownerType ? input.ownerId : null,
      metadata: (input.metadata ?? undefined) as never,
      uploadedByProfileId: input.uploadedByProfileId ?? null,
    },
  });
}

export function listAssets(
  workspaceId: string,
  opts: { kind?: string; ownerType?: string; ownerId?: string } = {},
): Promise<Asset[]> {
  return prisma.asset.findMany({
    where: {
      workspaceId,
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.ownerType ? { ownerType: opts.ownerType } : {}),
      ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

/** All artifacts owned by a company (#27) — sugar over listAssets. */
export function listCompanyArtifacts(workspaceId: string, companyId: string): Promise<Asset[]> {
  return listAssets(workspaceId, { ownerType: "company", ownerId: companyId });
}

/** A short-lived presigned download URL for an asset. */
export async function getAssetDownloadUrl(workspaceId: string, id: string): Promise<string> {
  const asset = await prisma.asset.findFirst({
    where: { id, workspaceId },
    select: { storageKey: true },
  });
  if (!asset) badRequest("Asset not found");
  return generateDownloadUrl(asset.storageKey);
}

/**
 * Delete an asset: remove the object from R2 (best-effort — a storage failure must not strand the
 * metadata; the orphaned object is swept separately) then delete the row. Returns false if not found.
 */
export async function deleteAsset(workspaceId: string, id: string): Promise<boolean> {
  const asset = await prisma.asset.findFirst({
    where: { id, workspaceId },
    select: { id: true, storageKey: true },
  });
  if (!asset) return false;
  try {
    await deleteFile(asset.storageKey);
  } catch (err) {
    console.error(
      `[assets] storage delete failed for key="${asset.storageKey}" (row removed anyway)`,
      err,
    );
  }
  await prisma.asset.delete({ where: { id: asset.id } });
  return true;
}
