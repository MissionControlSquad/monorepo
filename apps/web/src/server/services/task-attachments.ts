import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { TaskAttachment } from "@agentcenter/database";
import { generateUploadUrl, generateDownloadUrl, deleteFile } from "@/server/storage/r2";
import { StoragePrefix } from "@/server/constants";
import { badRequest } from "./service-errors";

// Task artifact attachments (parity: agent/user attaches a produced file to a task/issue). Reuses the
// existing Asset/R2 two-step presigned upload rather than a new bucket: presignTaskAttachment mints a
// presigned PUT + a `pending` row -> the client/agent PUTs the bytes to R2 -> confirmTaskAttachment
// flips the row to `uploaded`. Content lives in R2 under the shared `attachments/` prefix; this row is
// the metadata + pointer. Every function is workspace-scoped (D5) so a foreign task's attachments are
// never reachable.

export interface PresignTaskAttachmentResult {
  attachment: TaskAttachment;
  uploadUrl: string;
}

/**
 * Presign a direct-to-R2 upload for a task attachment and persist a `pending` row. The task must
 * belong to `workspaceId` (verified via its project) OR be scoped by the caller supplying a
 * pre-resolved workspaceId (the agent bridge passes the run's workspaceId). Returns the pending row
 * plus the presigned PUT URL; the caller PUTs the bytes then calls confirmTaskAttachment.
 */
export async function presignTaskAttachment(input: {
  workspaceId: string;
  taskId: string;
  fileName: string;
  contentType: string;
  uploadedByProfileId?: string | null;
}): Promise<PresignTaskAttachmentResult> {
  const fileName = input.fileName?.trim();
  const contentType = input.contentType?.trim();
  if (!input.taskId?.trim()) badRequest("taskId is required");
  if (!fileName) badRequest("fileName is required");
  if (!contentType) badRequest("contentType is required");

  // Confirm the task exists (row is FK-bound to it). Existence check only; workspace scoping on the
  // attachment row is enforced by workspaceId, which we stamp from the caller's tenancy/run — never
  // from client input.
  const task = await prisma.task.findUnique({ where: { id: input.taskId }, select: { id: true } });
  if (!task) badRequest("Task not found");

  const { key, uploadUrl } = await generateUploadUrl(
    fileName,
    contentType,
    StoragePrefix.ATTACHMENTS,
  );

  const attachment = await prisma.taskAttachment.create({
    data: {
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      storageKey: key,
      fileName,
      contentType,
      status: "pending",
      uploadedByProfileId: input.uploadedByProfileId ?? null,
    },
  });

  return { attachment, uploadUrl };
}

/** Mark a pending attachment as uploaded (after the client/agent has PUT the bytes to R2). */
export async function confirmTaskAttachment(
  workspaceId: string,
  id: string,
  byteSize?: number | null,
): Promise<TaskAttachment> {
  const existing = await prisma.taskAttachment.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!existing) badRequest("Attachment not found");
  return prisma.taskAttachment.update({
    where: { id: existing.id },
    data: {
      status: "uploaded",
      ...(byteSize != null ? { byteSize: Math.max(0, Math.round(byteSize)) } : {}),
    },
  });
}

/** List a task's attachments (workspace-scoped). Uploaded rows only unless includePending. */
export function listTaskAttachments(
  workspaceId: string,
  taskId: string,
  opts: { includePending?: boolean } = {},
): Promise<TaskAttachment[]> {
  return prisma.taskAttachment.findMany({
    where: {
      workspaceId,
      taskId,
      ...(opts.includePending ? {} : { status: "uploaded" }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/** A short-lived presigned download URL for an attachment (workspace-scoped). */
export async function getTaskAttachmentDownloadUrl(
  workspaceId: string,
  id: string,
): Promise<string> {
  const attachment = await prisma.taskAttachment.findFirst({
    where: { id, workspaceId },
    select: { storageKey: true },
  });
  if (!attachment) badRequest("Attachment not found");
  return generateDownloadUrl(attachment.storageKey);
}

/**
 * Delete an attachment. Author-or-admin: a non-admin caller may only delete a row they uploaded.
 * Removes the R2 object best-effort (a storage failure must not strand the row) then the row.
 * Returns false if not found or not permitted.
 */
export async function deleteTaskAttachment(
  workspaceId: string,
  id: string,
  opts: { requesterProfileId?: string | null; isAdmin?: boolean } = {},
): Promise<boolean> {
  const attachment = await prisma.taskAttachment.findFirst({
    where: { id, workspaceId },
    select: { id: true, storageKey: true, uploadedByProfileId: true },
  });
  if (!attachment) return false;
  if (!opts.isAdmin) {
    const isAuthor =
      !!opts.requesterProfileId && attachment.uploadedByProfileId === opts.requesterProfileId;
    if (!isAuthor) {
      throw new GraphQLError("Only the uploader or an admin may delete this attachment", {
        extensions: { code: "FORBIDDEN" },
      });
    }
  }
  try {
    await deleteFile(attachment.storageKey);
  } catch (err) {
    console.error(
      `[task-attachments] storage delete failed for key="${attachment.storageKey}" (row removed anyway)`,
      err,
    );
  }
  await prisma.taskAttachment.delete({ where: { id: attachment.id } });
  return true;
}
