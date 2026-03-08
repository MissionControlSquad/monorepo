"use client";

import { Card as ShadcnCard } from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";

type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  padding?: CardPadding;
  children?: React.ReactNode;
  href?: string;
  [key: string]: unknown;
}

const paddingClasses: Record<CardPadding, string> = {
  none: "p-0 gap-0",
  sm: "p-3 gap-0",
  md: "p-4 gap-0",
  lg: "p-6 gap-0",
};

export function Card({
  as: Component,
  padding = "none",
  className,
  children,
  ...props
}: CardProps) {
  if (Component) {
    return (
      <Component
        className={cn(
          "bg-card text-card-foreground rounded-xl border shadow-sm",
          paddingClasses[padding],
          className,
        )}
        {...props}
      >
        {children}
      </Component>
    );
  }

  return (
    <ShadcnCard className={cn(paddingClasses[padding], className)} {...props}>
      {children}
    </ShadcnCard>
  );
}
