import type { ReactNode } from "react";
import { Loader2, AlertCircle } from "lucide-react";

/** Centered spinner — the detail-page "still fetching, no data yet" state. */
export function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Centered icon + message — the detail-page error / not-found state. */
export function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <AlertCircle className="h-8 w-8" />
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}
