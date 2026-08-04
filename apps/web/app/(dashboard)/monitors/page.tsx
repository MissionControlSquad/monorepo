"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { Gauge } from "lucide-react";
import { MONITORS_QUERY } from "@/lib/graphql/queries";
import { UPDATE_MONITOR, DELETE_MONITOR } from "@/lib/graphql/mutations";
import { monitorMetricLabel } from "@agentcenter/utils";
import type { MonitorMetric } from "@agentcenter/utils";
import { Button, Card, Badge, ConfirmDialog, EmptyState } from "@/components/ui";
import { MonitorDialog } from "@/components/dialogs/MonitorDialog";
import { useConfirmDelete } from "@/hooks/useCrud";

// Tier C: workspace health monitors. MONITORS-gated. A monitor is a named threshold over a computed
// metric, evaluated live on load (the auto-firing scheduler is deferred — needs the execution engine).
interface MonitorEval {
  id: string;
  name: string;
  metric: string;
  comparator: string;
  threshold: number;
  isActive: boolean;
  value: number;
  breached: boolean;
}

const COMPARATOR_LABEL: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

export default function MonitorsPage() {
  const [{ data }, refetch] = useQuery<{ monitors: MonitorEval[] }>({ query: MONITORS_QUERY });
  const [, updateMonitor] = useMutation(UPDATE_MONITOR);
  const [, deleteMonitor] = useMutation(DELETE_MONITOR);

  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const monitors = data?.monitors ?? [];
  const breachedCount = monitors.filter((m) => m.breached).length;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  const del = useConfirmDelete<MonitorEval>({
    onDelete: async (m) => {
      const r = await deleteMonitor({ id: m.id });
      return r.error?.message ?? null;
    },
    onDone: refresh,
  });

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">Monitors</h1>
            {breachedCount > 0 && <Badge variant="red">{breachedCount} breaching</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Threshold alerts over live workspace metrics, evaluated on load.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>New monitor</Button>
      </div>

      <MonitorDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

      {monitors.length === 0 ? (
        <EmptyState
          icon={<Gauge className="h-8 w-8" />}
          title="No monitors yet"
          description="Create a monitor to watch a workspace metric."
        />
      ) : (
        monitors.map((m) => (
          <Card key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{m.name}</span>
              {!m.isActive && <Badge variant="gray">paused</Badge>}
              {m.breached && m.isActive && <Badge variant="red">breaching</Badge>}
              <span className="text-sm text-muted-foreground">
                {monitorMetricLabel(m.metric as MonitorMetric)} {COMPARATOR_LABEL[m.comparator]}{" "}
                {m.threshold}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span
                className={`text-sm font-semibold ${
                  m.breached && m.isActive ? "text-destructive" : "text-foreground"
                }`}
              >
                now: {m.value}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === m.id}
                onClick={async () => {
                  setBusy(m.id);
                  try {
                    await updateMonitor({ id: m.id, isActive: !m.isActive });
                    refresh();
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {m.isActive ? "Pause" : "Activate"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => del.ask(m)}>
                Delete
              </Button>
            </span>
          </Card>
        ))
      )}

      <ConfirmDialog
        isOpen={del.isOpen}
        onClose={del.cancel}
        onConfirm={del.confirm}
        title="Delete monitor?"
        description={`"${del.target?.name}" will stop alerting. This can't be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
