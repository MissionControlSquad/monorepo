"use client";

import { useState, useEffect, useMemo } from "react";

type HljsApi = typeof import("highlight.js/lib/common").default;

let hljsPromise: Promise<HljsApi> | null = null;
let hljsInstance: HljsApi | null = null;

function loadHljs(): Promise<HljsApi> {
  if (hljsInstance) return Promise.resolve(hljsInstance);
  if (!hljsPromise) {
    hljsPromise = import("highlight.js/lib/common").then((m) => {
      hljsInstance = m.default;
      return hljsInstance;
    });
  }
  return hljsPromise;
}

/**
 * Returns highlight.js instance once loaded (null while loading).
 * Triggers a single dynamic import on first use across the app.
 */
export function useHljs(): HljsApi | null {
  const [hljs, setHljs] = useState<HljsApi | null>(hljsInstance);

  useEffect(() => {
    if (hljsInstance) {
      setHljs(hljsInstance);
      return;
    }
    let cancelled = false;
    loadHljs().then((instance) => {
      if (!cancelled) setHljs(instance);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return hljs;
}

/**
 * Highlight code with a language hint, falling back to auto-detection.
 * Returns raw HTML string, or escaped plain text while hljs loads.
 */
export function useHighlightedHtml(code: string, language?: string): string {
  const hljs = useHljs();

  return useMemo(() => {
    if (!hljs) {
      // Escape HTML while hljs is loading
      return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return hljs.highlightAuto(code).value;
  }, [hljs, code, language]);
}

/**
 * Pre-load highlight.js (e.g. on hover). Call this to warm the cache
 * before the user actually needs highlighting.
 */
export function preloadHljs(): void {
  loadHljs();
}
