"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mb-4">
          An unexpected error occurred. Please try again.
        </p>
        <Button
          variant="link"
          size="sm"
          onClick={reset}
          className="px-0 text-blue-600 hover:text-blue-700"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
