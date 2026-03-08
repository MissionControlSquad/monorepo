"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Generic navigation hook — returns a function that navigates to `/{prefix}/{ref}`.
 * With intercepting routes, soft navigation shows a modal overlay.
 */
function useEntityNavigation(prefix: string) {
  const router = useRouter();
  return useCallback(
    (ref: string | number, options?: { replace?: boolean }) => {
      const url = `/${prefix}/${ref}`;
      if (options?.replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
    },
    [router, prefix],
  );
}

/**
 * Returns a navigate function that opens a task by navigating to /task/:ref.
 * With intercepting routes, this shows a modal overlay on soft navigation
 * and a full page on hard navigation.
 */
export function useTaskNavigation() {
  return useEntityNavigation("task");
}

/**
 * Returns a navigate function that opens a deliverable by navigating to /deliverable/:id.
 * With intercepting routes, this shows a modal overlay on soft navigation
 * and a full page on hard navigation.
 */
export function useDeliverableNavigation() {
  return useEntityNavigation("deliverable");
}
