"use client";

import { useEffect, useRef } from "react";

/**
 * Reusable IntersectionObserver hook for infinite scroll.
 * Returns a ref to attach to a sentinel element at the bottom of a scrollable list.
 * When the sentinel becomes visible and more data can be loaded, calls loadMore().
 */
export function useScrollSentinel(
  loadMore: (numItems: number) => void,
  status: "CanLoadMore" | "LoadingMore" | "Exhausted" | "LoadingFirstPage",
  batchSize: number = 20,
) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && status === "CanLoadMore") {
          loadMore(batchSize);
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, status, batchSize]);

  return sentinelRef;
}
