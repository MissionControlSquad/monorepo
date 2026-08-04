"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "urql";
import { ASSETS_QUERY } from "@/lib/graphql/queries";
import { CREATE_ASSET_UPLOAD_URL, RECORD_ASSET, DELETE_ASSET } from "@/lib/graphql/mutations";
import { Button, Card, Badge, EmptyState } from "@/components/ui";
import { FileBox } from "lucide-react";

// Asset store (parity #15/#27). ASSETS-gated. Two-step upload: presign → PUT to R2 → record. The page
// is reachable at /assets; enable the ASSETS flag (Settings → Feature flags) to use it.
interface Asset {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  ownerType: string | null;
  ownerId: string | null;
  createdAt: string;
}

function kindFor(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || mime.startsWith("text/")) return "document";
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("gzip")) return "archive";
  return "binary";
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AssetsPage() {
  const [{ data, fetching }, refetch] = useQuery<{ assets: Asset[] }>({ query: ASSETS_QUERY });
  const [, presign] = useMutation(CREATE_ASSET_UPLOAD_URL);
  const [, record] = useMutation(RECORD_ASSET);
  const [, remove] = useMutation(DELETE_ASSET);

  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assets = data?.assets ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const p = await presign({ fileName: file.name, mimeType: file.type || "application/octet-stream" });
      if (p.error || !p.data?.createAssetUploadUrl) throw new Error(p.error?.message ?? "presign failed");
      const { key, uploadUrl } = p.data.createAssetUploadUrl;
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
      const r = await record({
        name: file.name,
        kind: kindFor(file.type),
        mimeType: file.type || "application/octet-stream",
        storageKey: key,
        sizeBytes: file.size,
      });
      if (r.error) throw new Error(r.error.message);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onDelete(id: string) {
    await remove({ id });
    refresh();
  }

  return (
    <div className="mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Assets</h1>
          <p className="text-sm text-muted-foreground">Uploaded workspace files (images, docs, binaries).</p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? "Uploading…" : "Upload file"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {assets.length === 0 && !fetching ? (
        <EmptyState icon={<FileBox className="h-8 w-8" />} title="No assets yet" description="Upload a file to get started." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {assets.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.mimeType} · {humanSize(a.sizeBytes)} · {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{a.kind}</Badge>
                  {a.ownerType && <Badge variant="blue">{a.ownerType}</Badge>}
                  <Button variant="ghost" size="sm" onClick={() => onDelete(a.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
