"use client";

import { useQuery } from "urql";
import { BLOCKER_DIAGNOSTICS_QUERY } from "@/lib/graphql/queries";
import { Badge } from "@/components/ui";

// Domain 8 G6.1: "why is this task blocked?" readiness diagnostics. Read-only; keyed by taskId.
// Renders nothing when the task is ready and has no unresolved blockers (avoids clutter).
interface Blocker {
  taskId: string;
  status: string;
  source: string;
  resolved: boolean;
}
interface Diagnostics {
  readiness: string;
  unresolvedCount: number;
  reasons: string[];
  blockers: Blocker[];
}

type BadgeVariant = "gray" | "yellow" | "green" | "red" | "orange";
const READINESS_VARIANT: Record<string, BadgeVariant> = {
  ready: "green",
  blocked: "red",
  waiting: "yellow",
};

export function TaskBlockerDiagnosticsCard({ taskId }: { taskId: string }) {
  const [{ data }] = useQuery<{ blockerDiagnostics: Diagnostics }>({
    query: BLOCKER_DIAGNOSTICS_QUERY,
    variables: { taskId },
  });
  const d = data?.blockerDiagnostics;
  if (!d) return null;
  // Nothing worth showing for a clean, ready task.
  if (d.readiness === "ready" && d.unresolvedCount === 0 && d.blockers.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground">Readiness</h3>
        <Badge variant={READINESS_VARIANT[d.readiness] ?? "gray"}>{d.readiness}</Badge>
        {d.unresolvedCount > 0 && (
          <span className="text-xs text-muted-foreground">{d.unresolvedCount} unresolved</span>
        )}
      </div>
      {d.reasons.length > 0 && (
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {d.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {d.blockers.length > 0 && (
        <div className="space-y-1">
          {d.blockers.map((b, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {b.source} · {b.status}
              </span>
              <Badge variant={b.resolved ? "green" : "orange"} size="sm">
                {b.resolved ? "resolved" : "open"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
