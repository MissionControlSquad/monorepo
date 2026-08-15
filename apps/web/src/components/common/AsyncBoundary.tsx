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

/**
 * Standardizes the detail-page `fetching → error → not-found → data` triad that was hand-rolled after
 * every single-record `useQuery`. Renders a spinner while fetching with no data yet, an error message on
 * error, a "<Label> not found" message when the query resolved but the record is absent, otherwise the
 * children called with the non-null record.
 *
 *   <AsyncBoundary data={data?.routine} fetching={fetching} error={error} label="routine">
 *     {(routine) => <RoutineBody routine={routine} />}
 *   </AsyncBoundary>
 */
export function AsyncBoundary<T>({
  data,
  fetching,
  error,
  label,
  children,
}: {
  data: T | null | undefined;
  fetching: boolean;
  error?: unknown;
  /** Lowercase noun, e.g. "routine" → "Could not load this routine" / "Routine not found". */
  label: string;
  children: (data: T) => ReactNode;
}) {
  if (fetching && data == null) return <CenteredSpinner />;
  if (error) return <CenteredMessage>Could not load this {label}</CenteredMessage>;
  if (data == null) {
    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    return <CenteredMessage>{capitalized} not found</CenteredMessage>;
  }
  return <>{children(data)}</>;
}
