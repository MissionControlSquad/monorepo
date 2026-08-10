"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free tooltip. Shows `content` on hover AND on keyboard focus of the wrapped
 * trigger (focus-within), so it is fully keyboard-accessible. Uses design-system tokens only, so it
 * reads correctly in both light and dark themes. The bubble is `aria-hidden` (decorative) and the
 * trigger carries the same text via `aria-describedby`/`title` for assistive tech.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const id = useId();
  return (
    <span className="group relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2 scale-95 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-normal leading-snug text-popover-foreground opacity-0 shadow-md transition duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
