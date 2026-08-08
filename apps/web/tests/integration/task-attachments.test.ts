import { describe, it, expect, beforeEach, vi } from "vitest";

// R2 object I/O needs live creds; the service layer is what we exercise here. Mock the storage helpers
// so presign returns a deterministic key/url and delete is a no-op (matches prod's best-effort delete).
vi.mock("../../src/server/storage/r2", () => ({
  generateUploadUrl: vi.fn(async (fileName: string) => ({
    key: `attachments/mock-${fileName}`,
    uploadUrl: `https://r2.example/upload/${fileName}`,
  })),
  generateDownloadUrl: vi.fn(async (key: string) => `https://r2.example/download/${key}`),
  deleteFile: vi.fn(async () => {}),
}));

import { prisma } from "../../src/server/prisma";
import {
  presignTaskAttachment,
  confirmTaskAttachment,
  listTaskAttachments,
  getTaskAttachmentDownloadUrl,
  deleteTaskAttachment,
} from "../../src/server/services/task-attachments";

const WS_A = "ws_attach_a";
const WS_B = "ws_attach_b";

async function makeTask(title: string): Promise<string> {
  const task = await prisma.task.create({
    data: { title, description: "attachment test" },
    select: { id: true },
  });
  return task.id;
}

let taskId: string;

beforeEach(async () => {
  await prisma.taskAttachment.deleteMany({ where: { workspaceId: { in: [WS_A, WS_B] } } });
  await prisma.task.deleteMany({ where: { title: { startsWith: "attach-test-" } } });
  taskId = await makeTask("attach-test-main");
});

describe("task attachments — presign → confirm → list → delete", () => {
  it("runs the full lifecycle", async () => {
    // presign creates a pending row (not yet listed) + returns a presigned PUT
    const { attachment, uploadUrl } = await presignTaskAttachment({
      workspaceId: WS_A,
      taskId,
      fileName: "report.pdf",
      contentType: "application/pdf",
      uploadedByProfileId: "user_1",
    });
    expect(uploadUrl).toContain("report.pdf");
    expect(attachment.status).toBe("pending");
    expect(attachment.storageKey).toContain("attachments/");
    // pending rows are hidden from the default list
    expect(await listTaskAttachments(WS_A, taskId)).toHaveLength(0);
    expect(await listTaskAttachments(WS_A, taskId, { includePending: true })).toHaveLength(1);

    // confirm flips it to uploaded (+ records size)
    const confirmed = await confirmTaskAttachment(WS_A, attachment.id, 2048);
    expect(confirmed.status).toBe("uploaded");
    expect(confirmed.byteSize).toBe(2048);

    // list now shows it
    const listed = await listTaskAttachments(WS_A, taskId);
    expect(listed).toHaveLength(1);
    expect(listed[0].fileName).toBe("report.pdf");

    // download URL is derived from the stored key
    const url = await getTaskAttachmentDownloadUrl(WS_A, attachment.id);
    expect(url).toContain("download");

    // delete (admin) removes it
    expect(await deleteTaskAttachment(WS_A, attachment.id, { isAdmin: true })).toBe(true);
    expect(await listTaskAttachments(WS_A, taskId)).toHaveLength(0);
    // deleting again is a no-op
    expect(await deleteTaskAttachment(WS_A, attachment.id, { isAdmin: true })).toBe(false);
  });

  it("enforces author-or-admin on delete", async () => {
    const { attachment } = await presignTaskAttachment({
      workspaceId: WS_A,
      taskId,
      fileName: "notes.txt",
      contentType: "text/plain",
      uploadedByProfileId: "author_1",
    });
    await confirmTaskAttachment(WS_A, attachment.id);

    // a non-admin who is not the uploader is refused
    await expect(
      deleteTaskAttachment(WS_A, attachment.id, {
        requesterProfileId: "someone_else",
        isAdmin: false,
      }),
    ).rejects.toThrow(/uploader or an admin/);

    // the author may delete their own
    expect(
      await deleteTaskAttachment(WS_A, attachment.id, {
        requesterProfileId: "author_1",
        isAdmin: false,
      }),
    ).toBe(true);
  });
});

describe("task attachments — cross-workspace isolation", () => {
  it("never exposes a foreign workspace's attachments", async () => {
    const { attachment } = await presignTaskAttachment({
      workspaceId: WS_A,
      taskId,
      fileName: "secret.bin",
      contentType: "application/octet-stream",
      uploadedByProfileId: "user_a",
    });
    await confirmTaskAttachment(WS_A, attachment.id);

    // WS_A sees it; WS_B (even for the same taskId) sees nothing
    expect(await listTaskAttachments(WS_A, taskId)).toHaveLength(1);
    expect(await listTaskAttachments(WS_B, taskId)).toHaveLength(0);

    // confirm / download / delete from the foreign workspace all fail-closed
    await expect(confirmTaskAttachment(WS_B, attachment.id)).rejects.toThrow(/not found/i);
    await expect(getTaskAttachmentDownloadUrl(WS_B, attachment.id)).rejects.toThrow(/not found/i);
    expect(await deleteTaskAttachment(WS_B, attachment.id, { isAdmin: true })).toBe(false);

    // the row is untouched by the foreign attempts
    expect(await listTaskAttachments(WS_A, taskId)).toHaveLength(1);
  });
});
