"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { shouldIgnoreKeyboardShortcut } from "@agentcenter/utils";

/**
 * Registers "G then letter" navigation shortcuts (vim-style go-to).
 * Press G, then within 1s press another key to navigate.
 */
export function useGoShortcuts() {
  const router = useRouter();
  const pendingG = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyboardShortcut(e)) return;

      if (!pendingG.current && e.key === "g") {
        pendingG.current = true;
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          pendingG.current = false;
        }, 1000);
        return;
      }

      if (pendingG.current) {
        pendingG.current = false;
        clearTimeout(timeoutRef.current);

        const routes: Record<string, string> = {
          h: "/",
          a: "/agents",
          p: "/projects",
          c: "/channels",
          s: "/settings",
          n: "/analytics",
        };

        const route = routes[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          router.push(route);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeoutRef.current);
    };
  }, [router]);
}
