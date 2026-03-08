"use client";

import { Badge as ShadcnBadge } from "@/components/ui/shadcn/badge";
import { cn } from "@/lib/utils";

type BadgeVariant = "gray" | "blue" | "yellow" | "green" | "red" | "purple" | "orange" | "indigo";
type BadgeSize = "sm" | "md";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  gray: "bg-muted text-foreground border-transparent",
  blue: "bg-indigo-50 text-indigo-700 border-transparent",
  yellow: "bg-warning-muted text-warning border-transparent",
  green: "bg-success-muted text-success border-transparent",
  red: "bg-destructive-muted text-destructive border-transparent",
  purple: "bg-purple-50 text-purple-700 border-transparent",
  orange: "bg-orange-50 text-orange-700 border-transparent",
  indigo: "bg-indigo-50 text-indigo-700 border-transparent",
};

const dotClasses: Record<BadgeVariant, string> = {
  gray: "bg-gray-400",
  blue: "bg-indigo-500",
  yellow: "bg-warning",
  green: "bg-success",
  red: "bg-destructive",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  indigo: "bg-indigo-500",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

export function Badge({
  children,
  variant = "gray",
  size = "sm",
  dot = false,
  className,
}: BadgeProps) {
  return (
    <ShadcnBadge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full border-transparent",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dotClasses[variant])} />}
      {children}
    </ShadcnBadge>
  );
}
