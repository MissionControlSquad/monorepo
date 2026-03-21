/**
 * @agentcenter/database - Document Operations
 *
 * Create a Document record for an uploaded file attachment.
 */

import { prisma } from "../client";

export interface CreateFileDocumentInput {
  title: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdById?: string | null;
  createdByProfileId?: string | null;
}

export async function createFileDocument(input: CreateFileDocumentInput) {
  return prisma.document.create({
    data: {
      title: input.title,
      content: "",
      type: "file",
      storageKey: input.storageKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      createdById: input.createdById ?? null,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}
