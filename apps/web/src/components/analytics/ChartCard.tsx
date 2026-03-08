"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "../ui";

interface ChartCardProps {
  title: string;
  children: ReactNode;
  loading?: boolean;
  className?: string;
}

export function ChartCard({ title, children, loading, className = "" }: ChartCardProps) {
  return (
    <Card className={className}>
      <div className="px-3 py-3 @xl:px-5 @xl:py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-3 @xl:p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}
