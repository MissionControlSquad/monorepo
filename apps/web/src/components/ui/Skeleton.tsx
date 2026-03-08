"use client";

import { cn } from "@/lib/utils";
import { Card } from "./Card";

interface SkeletonProps {
  className?: string;
}

/** Base shimmer block. Pass height/width via className. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("bg-muted rounded-lg animate-pulse", className)} />;
}

/** Card-shaped skeleton with border and shadow. */
export function CardSkeleton({ className }: SkeletonProps) {
  return <Card className={cn("animate-pulse", className)} />;
}

interface SkeletonListProps {
  count?: number;
  height?: string;
  variant?: "row" | "card";
  gap?: string;
  className?: string;
}

/** Renders a vertical list of skeleton items. */
export function SkeletonList({
  count = 3,
  height = "h-12",
  variant = "row",
  gap = "space-y-3",
  className,
}: SkeletonListProps) {
  const Component = variant === "card" ? CardSkeleton : Skeleton;
  return (
    <div className={cn(gap, className)}>
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} className={height} />
      ))}
    </div>
  );
}
