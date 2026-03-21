/** @agentcenter/database - Deliverable Mutation Operations
 * Transactional create/update for deliverables with version snapshots.
 */

import { prisma } from "../client";
import type { DeliverableKind } from "@prisma/client";

interface CurrentDeliverable {
  id: string;
  version: number;
  title: string;
  kind: DeliverableKind;
  content: string | null;
  language: string | null;
  storageKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  url: string | null;
}

interface RevisionData {
  title?: string;
  content?: string;
  language?: string;
  storageKey?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  url?: string;
}

/** Snapshot the current deliverable as a version and update it in-place (single transaction). */
export async function runDeliverableRevisionTransaction(
  current: CurrentDeliverable,
  editedByProfileId: string,
  updates: RevisionData,
  query?: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    // Snapshot current state as a version
    await tx.deliverableVersion.create({
      data: {
        deliverableId: current.id,
        version: current.version,
        title: current.title,
        kind: current.kind,
        content: current.content ?? undefined,
        language: current.language ?? undefined,
        storageKey: current.storageKey ?? undefined,
        fileName: current.fileName ?? undefined,
        mimeType: current.mimeType ?? undefined,
        fileSize: current.fileSize ?? undefined,
        url: current.url ?? undefined,
        editedByProfileId,
      },
    });

    // Update deliverable in-place with incremented version
    return tx.deliverable.update({
      where: { id: current.id },
      ...query,
      data: {
        version: current.version + 1,
        ...(updates.title ? { title: updates.title } : {}),
        ...(updates.content !== undefined ? { content: updates.content } : {}),
        ...(updates.language !== undefined ? { language: updates.language } : {}),
        ...(updates.storageKey !== undefined ? { storageKey: updates.storageKey } : {}),
        ...(updates.fileName !== undefined ? { fileName: updates.fileName } : {}),
        ...(updates.mimeType !== undefined ? { mimeType: updates.mimeType } : {}),
        ...(updates.fileSize !== undefined ? { fileSize: updates.fileSize } : {}),
        ...(updates.url !== undefined ? { url: updates.url } : {}),
      },
    });
  });
}
