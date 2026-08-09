"use client";

import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: React.ReactNode;
  maxWidth?: "narrow" | "medium" | "default" | "wide" | "full";
  className?: string;
}

const MAX_WIDTH_CLASSES = {
  narrow: "max-w-2xl",
  medium: "max-w-4xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

export function PageLayout({ children, maxWidth = "default", className }: PageLayoutProps) {
  const isNarrow = maxWidth === "narrow";
  return (
    <div className="@container flex-1 overflow-y-auto">
      <div
        className={cn(
          MAX_WIDTH_CLASSES[maxWidth],
          "mx-auto px-4 @xl:px-6 @4xl:px-8",
          isNarrow ? "py-8 space-y-8" : "py-6 space-y-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
