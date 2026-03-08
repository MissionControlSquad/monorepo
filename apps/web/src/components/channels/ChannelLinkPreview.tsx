"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";

interface OgMeta {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
}

// Simple in-memory cache to avoid refetching the same URL
const cache = new Map<string, OgMeta | null>();

/** Extract the first URL from a message string. */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>)"']+/);
  return match ? match[0] : null;
}

interface ChannelLinkPreviewProps {
  url: string;
}

export function ChannelLinkPreview({ url }: ChannelLinkPreviewProps) {
  const [meta, setMeta] = useState<OgMeta | null>(cache.get(url) ?? null);
  const [loading, setLoading] = useState(!cache.has(url));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cache.has(url)) {
      setMeta(cache.get(url) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/og-meta?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data: OgMeta) => {
        if (cancelled) return;
        cache.set(url, data);
        setMeta(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        cache.set(url, null);
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading || error || !meta) return null;
  if (!meta.title && !meta.description) return null;

  const hostname = (() => {
    try {
      return new URL(meta.url || url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex overflow-hidden rounded-lg border border-border hover:border-border transition-colors max-w-md bg-background"
    >
      {meta.image && (
        <div className="shrink-0 w-20 bg-muted">
          <img
            src={meta.image}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="flex-1 min-w-0 px-3 py-2">
        {(meta.siteName || hostname) && (
          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
            <ExternalLink className="w-3 h-3 shrink-0" />
            {meta.siteName || hostname}
          </p>
        )}
        {meta.title && (
          <p className="text-sm font-medium text-foreground truncate mt-0.5">{meta.title}</p>
        )}
        {meta.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{meta.description}</p>
        )}
      </div>
    </a>
  );
}
