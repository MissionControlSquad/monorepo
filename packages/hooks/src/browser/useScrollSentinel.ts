import { useEffect, useRef } from "react";

/**
 * IntersectionObserver-based infinite scroll hook.
 * Attach the returned ref to a sentinel element at the bottom of a list.
 * Calls `loadMore` whenever the sentinel becomes visible and more data is available.
 * Browser/Electron only — not supported in React Native.
 */
export function useScrollSentinel(
  loadMore: (numItems: number) => void,
  status: "CanLoadMore" | "LoadingMore" | "Exhausted" | "LoadingFirstPage",
  batchSize: number = 20,
): React.RefObject<HTMLDivElement | null> {
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
