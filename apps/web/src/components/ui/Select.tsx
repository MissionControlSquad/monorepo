"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** `md` (default) matches form-dialog fields; `sm` matches compact inline/table-row controls. */
  size?: "sm" | "md";
}

const SIZE_CLASSES: Record<NonNullable<SelectProps["size"]>, string> = {
  md: "h-9 w-full rounded-md border border-input bg-background px-3 text-sm",
  sm: "rounded-md border border-input bg-background px-2 py-1 text-sm",
};

/**
 * Native `<select>` atomic — the reusable replacement for hand-rolled inline
 * `<select className="… border-input …">` controls. Keeps native behavior/theme;
 * pass `className` to tweak (e.g. `text-xs`) — tailwind-merge resolves conflicts.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = "md", className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        SIZE_CLASSES[size],
        "text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);

Select.displayName = "Select";
