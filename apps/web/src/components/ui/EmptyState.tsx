"use client";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md">
        <div
          className={cn(
            "inline-flex items-center justify-center size-16 rounded-2xl",
            "bg-indigo-100 text-indigo-600 mb-5 [&_svg]:size-8",
          )}
        >
          {icon}
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{description}</p>
        {action}
      </div>
    </div>
  );
}
