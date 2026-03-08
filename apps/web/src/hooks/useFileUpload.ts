"use client";

import { useState, useCallback, useMemo } from "react";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_FILES = 10;

const BLOCKED_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sharedlib",
  "application/x-mach-binary",
]);

export interface UploadingFile {
  id: string;
  file: File;
  documentId: string | null;
  status: "uploading" | "complete" | "error";
  error?: string;
  previewUrl?: string;
}

export interface UseFileUploadReturn {
  files: UploadingFile[];
  addFiles: (files: FileList | File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  isUploading: boolean;
  completedDocumentIds: string[];
}

export function useFileUpload(): UseFileUploadReturn {
  const [files, setFiles] = useState<UploadingFile[]>([]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const fileArray = Array.from(incoming);

    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) return prev;

      const toAdd = fileArray.slice(0, remaining);
      const newEntries: UploadingFile[] = toAdd.map((file) => {
        const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;

        // Validate
        if (file.size > MAX_FILE_SIZE) {
          return {
            id,
            file,
            documentId: null,
            status: "error" as const,
            error: "File exceeds 25 MB limit",
            previewUrl,
          };
        }
        if (BLOCKED_MIME_TYPES.has(file.type)) {
          return {
            id,
            file,
            documentId: null,
            status: "error" as const,
            error: "Executable files not allowed",
            previewUrl,
          };
        }

        return { id, file, documentId: null, status: "uploading" as const, previewUrl };
      });

      // Start uploading valid files
      for (const entry of newEntries) {
        if (entry.status === "uploading") {
          uploadFile(entry.id, entry.file);
        }
      }

      return [...prev, ...newEntries];
    });
  }, []);

  const uploadFile = async (id: string, file: File) => {
    try {
      // Upload file via our API (server uploads to R2, avoids browser CORS/DNS issues)
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/channels/attachments", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(data.error || "Upload failed");
      }

      const { documentId } = await res.json();

      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "complete" as const, documentId } : f)),
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: "error" as const,
                error: err instanceof Error ? err.message : "Upload failed",
              }
            : f,
        ),
      );
    }
  };

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      for (const f of prev) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      }
      return [];
    });
  }, []);

  const isUploading = useMemo(() => files.some((f) => f.status === "uploading"), [files]);
  const completedDocumentIds = useMemo(
    () => files.filter((f) => f.status === "complete" && f.documentId).map((f) => f.documentId!),
    [files],
  );

  return { files, addFiles, removeFile, clearFiles, isUploading, completedDocumentIds };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
