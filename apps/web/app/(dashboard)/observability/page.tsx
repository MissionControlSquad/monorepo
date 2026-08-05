"use client";

import { useQuery } from "urql";
import { WORKSPACE_SUMMARY_QUERY } from "@/lib/graphql/queries";
import { Button, Card } from "@/components/ui";

// Epic #13: observability dashboard. OBSERVABILITY-gated. Read-only workspace rollup — agent/task
// status, month-to-date spend, pending approvals, active budget incidents.

interface Summary {
  agents: { total: number; operational: number; blocked: number; idle: number; active: number };
  tasks: {
    total: number;
    open: number;
    inProgress: number;
    review: number;
    blocked: number;
    done: number;
  };
  monthSpendCents: number;
  pendingApprovals: number;
  activeBudgetIncidents: number;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {hint && <span className="text-xs text-muted-foreground/70">{hint}</span>}
    </div>
  );
}

export default function ObservabilityPage() {
  const [{ data, fetching }, refetch] = useQuery<{ workspaceSummary: Summary }>({
    query: WORKSPACE_SUMMARY_QUERY,
  });
  const s = data?.workspaceSummary;
  const money = (cents: number) =>
    `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Observability</h1>
          <p className="text-sm text-muted-foreground">
            A live rollup of this workspace&apos;s agents, tasks, spend, and approvals.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={fetching}
          onClick={() => refetch({ requestPolicy: "network-only" })}
        >
          Refresh
        </Button>
      </div>

      {!s && fetching && (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
      )}

      {s && (
        <>
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-medium text-foreground">Agents</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total" value={s.agents.total} />
              <Stat label="Operational" value={s.agents.operational} hint="idle + active" />
              <Stat label="Blocked" value={s.agents.blocked} />
              <Stat label="Active" value={s.agents.active} />
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-medium text-foreground">Tasks</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Open" value={s.tasks.open} hint="all non-done" />
              <Stat label="In progress" value={s.tasks.inProgress} />
              <Stat label="Blocked" value={s.tasks.blocked} />
              <Stat label="Done" value={s.tasks.done} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <Stat label="Month-to-date spend" value={money(s.monthSpendCents)} />
            </Card>
            <Card className="p-5">
              <Stat label="Pending approvals" value={s.pendingApprovals} />
            </Card>
            <Card className="p-5">
              <Stat label="Active budget incidents" value={s.activeBudgetIncidents} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
