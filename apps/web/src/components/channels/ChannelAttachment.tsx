"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FileText, Download, Image as ImageIcon, Film, Music, X } from "lucide-react";
import { formatFileSize } from "../../hooks/useFileUpload";
import { Button } from "@/components/ui";
import { getAssetUrl } from "../../lib/asset-url";

interface AttachmentDocument {
  id: string;
  title?: string;
  type?: string;
  storageKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

interface ChannelAttachmentProps {
  attachment: {
    id: string;
    documentId: string;
    document?: AttachmentDocument | null;
  };
}

export function ChannelAttachment({ attachment }: ChannelAttachmentProps) {
  const doc = attachment.document;
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!doc?.storageKey) return null;

  const fileUrl = getAssetUrl(doc.storageKey)!;
  const name = doc.fileName || doc.title || "File";
  const mime = doc.mimeType || "";
  const size = doc.fileSize;

  // Image
  if (mime.startsWith("image/")) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block rounded-lg overflow-hidden border border-border hover:border-border transition-colors max-w-xs cursor-zoom-in"
        >
          <img
            src={fileUrl}
            alt={name}
            className="max-h-60 w-auto object-contain bg-muted"
            loading="lazy"
          />
          <div className="px-2 py-1 bg-background text-xs text-muted-foreground truncate flex items-center gap-1">
            <ImageIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">{name}</span>
            {size != null && (
              <span className="shrink-0 text-muted-foreground">({formatFileSize(size)})</span>
            )}
          </div>
        </button>
        {lightboxOpen && (
          <MediaLightbox
            src={fileUrl}
            name={name}
            type="image"
            mime={mime}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </>
    );
  }

  // Video
  if (mime.startsWith("video/")) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="rounded-lg overflow-hidden border border-border hover:border-border transition-colors max-w-sm cursor-pointer"
        >
          <video preload="metadata" className="max-h-60 w-full bg-black pointer-events-none">
            <source src={fileUrl} type={mime} />
          </video>
          <div className="px-2 py-1 bg-background text-xs text-muted-foreground truncate flex items-center gap-1">
            <Film className="w-3 h-3 shrink-0" />
            <span className="truncate">{name}</span>
            {size != null && (
              <span className="shrink-0 text-muted-foreground">({formatFileSize(size)})</span>
            )}
          </div>
        </button>
        {lightboxOpen && (
          <MediaLightbox
            src={fileUrl}
            name={name}
            type="video"
            mime={mime}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </>
    );
  }

  // Audio
  if (mime.startsWith("audio/")) {
    return (
      <div className="rounded-lg border border-border p-2 bg-background max-w-sm">
        <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground">
          <Music className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{name}</span>
          {size != null && (
            <span className="shrink-0 text-muted-foreground">({formatFileSize(size)})</span>
          )}
        </div>
        <audio controls preload="metadata" className="w-full h-8">
          <source src={fileUrl} type={mime} />
        </audio>
      </div>
    );
  }

  // Generic file chip
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted hover:border-border transition-colors max-w-xs"
    >
      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground truncate">{name}</p>
        {size != null && <p className="text-xs text-muted-foreground">{formatFileSize(size)}</p>}
      </div>
      <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </a>
  );
}

/** Full-screen lightbox for images and videos, rendered via portal. */
function MediaLightbox({
  src,
  name,
  type,
  mime,
  onClose,
}: {
  src: string;
  name: string;
  type: "image" | "video";
  mime: string;
  onClose: () => void;
}) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 z-10">
        <span className="text-sm text-white/80 truncate max-w-[60%]">{name}</span>
        <div className="flex items-center gap-2">
          <a
            href={src}
            download={name}
            onClick={(e) => e.stopPropagation()}
            className="text-white/70 hover:text-white transition-colors"
            title="Download"
            aria-label="Download"
          >
            <Download className="w-5 h-5" />
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-background/10"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Media content */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {type === "image" ? (
          <img src={src} alt={name} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
        ) : (
          <video controls autoPlay className="max-w-full max-h-[85vh] rounded-lg">
            <source src={src} type={mime} />
          </video>
        )}
      </div>
    </div>,
    document.body,
  );
}
