"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useClient } from "urql";
import { Paperclip, Download, Trash2, Loader2, UploadCloud } from "lucide-react";
import { TASK_ATTACHMENTS_QUERY, TASK_ATTACHMENT_DOWNLOAD_URL_QUERY } from "@/lib/graphql/queries";
import {
  PRESIGN_TASK_ATTACHMENT,
  CONFIRM_TASK_ATTACHMENT,
  DELETE_TASK_ATTACHMENT,
} from "@/lib/graphql/mutations";

// Task artifact attachments (parity). Two-step presigned R2 upload: presign -> PUT the bytes to R2 ->
// confirm. List with download (short-lived presigned URL) + delete (author-or-admin, enforced server
// side). Reuses the shared design system; ASSETS-flag-gated at the resolver.
interface TaskAttachment {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  status: string;
  createdAt: string;
}

function formatBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachmentsCard({ taskId }: { taskId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ taskAttachments: TaskAttachment[] }>({
    query: TASK_ATTACHMENTS_QUERY,
    variables: { taskId },
  });
  const [, presign] = useMutation(PRESIGN_TASK_ATTACHMENT);
  const [, confirm] = useMutation(CONFIRM_TASK_ATTACHMENT);
  const [, removeAttachment] = useMutation(DELETE_TASK_ATTACHMENT);
  const client = useClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const attachments = data?.taskAttachments ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onPick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const res = await presign({
        taskId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      });
      if (res.error || !res.data?.presignTaskAttachment) {
        setErr(res.error?.graphQLErrors[0]?.message ?? "Could not start upload");
        return;
      }
      const { attachmentId, uploadUrl } = res.data.presignTaskAttachment;

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        setErr(`Upload failed (${put.status})`);
        return;
      }

      const conf = await confirm({ id: attachmentId, byteSize: file.size });
      if (conf.error) {
        setErr(conf.error.graphQLErrors[0]?.message ?? "Could not confirm upload");
        return;
      }
      refresh();
    } catch {
      setErr("Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onDownload(id: string) {
    setErr(null);
    setBusyId(id);
    try {
      const res = await client
        .query(TASK_ATTACHMENT_DOWNLOAD_URL_QUERY, { id }, { requestPolicy: "network-only" })
        .toPromise();
      const url = res.data?.taskAttachmentDownloadUrl as string | undefined;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setErr(res.error?.graphQLErrors[0]?.message ?? "Could not get download link");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    setErr(null);
    setBusyId(id);
    try {
      const res = await removeAttachment({ id });
      if (res.error) setErr(res.error.graphQLErrors[0]?.message ?? "Could not delete");
      else refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
        </h3>
        <button
          className="flex items-center gap-1 rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <UploadCloud className="h-3 w-3" />
          )}
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>

      <div className="space-y-1">
        {fetching && attachments.length === 0 && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        {!fetching && attachments.length === 0 && (
          <p className="text-xs text-muted-foreground">No attachments yet.</p>
        )}
        {attachments.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex min-w-0 items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{a.fileName}</span>
              {a.byteSize > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBytes(a.byteSize)}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                className="text-muted-foreground hover:text-primary disabled:opacity-50"
                disabled={busyId === a.id}
                onClick={() => onDownload(a.id)}
                aria-label="Download attachment"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                disabled={busyId === a.id}
                onClick={() => onDelete(a.id)}
                aria-label="Delete attachment"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
