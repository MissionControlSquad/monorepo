"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { Gauge } from "lucide-react";
import { MONITORS_QUERY } from "@/lib/graphql/queries";
import { CREATE_MONITOR, UPDATE_MONITOR, DELETE_MONITOR } from "@/lib/graphql/mutations";
import { MONITOR_METRICS, MONITOR_COMPARATORS, monitorMetricLabel } from "@agentcenter/utils";
import type { MonitorMetric } from "@agentcenter/utils";
import {
  Button,
  Card,
  Badge,
  Input,
  FormField,
  FormDialog,
  ConfirmDialog,
  EmptyState,
} from "@/components/ui";
import { useResourceDialog, useConfirmDelete } from "@/hooks/useCrud";

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
  const [, createMonitor] = useMutation(CREATE_MONITOR);
  const [, updateMonitor] = useMutation(UPDATE_MONITOR);
  const [, deleteMonitor] = useMutation(DELETE_MONITOR);

  const [busy, setBusy] = useState<string | null>(null);
  const monitors = data?.monitors ?? [];
  const breachedCount = monitors.filter((m) => m.breached).length;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  const dlg = useResourceDialog({
    empty: { name: "", metric: MONITOR_METRICS[0] as string, comparator: "gt", threshold: "0" },
    submit: async (v) => {
      if (!v.name.trim()) return "Name is required";
      const res = await createMonitor({
        name: v.name.trim(),
        metric: v.metric,
        comparator: v.comparator,
        threshold: Number(v.threshold) || 0,
      });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: refresh,
  });

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
        <Button onClick={dlg.openCreate}>New monitor</Button>
      </div>

      <FormDialog
        open={dlg.open}
        onOpenChange={dlg.setOpen}
        title="New monitor"
        description="Alert when a workspace metric crosses a threshold."
        onSubmit={dlg.onSubmit}
        submitLabel="Add monitor"
        busy={dlg.busy}
        error={dlg.error}
        submitDisabled={!dlg.values.name.trim()}
      >
        <FormField label="Name">
          <Input
            placeholder="e.g. Too many blocked agents"
            value={dlg.values.name}
            onChange={(e) => dlg.set("name", e.target.value)}
          />
        </FormField>
        <FormField label="Metric">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={dlg.values.metric}
            onChange={(e) => dlg.set("metric", e.target.value)}
          >
            {MONITOR_METRICS.map((m) => (
              <option key={m} value={m}>{monitorMetricLabel(m as MonitorMetric)}</option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Comparator">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={dlg.values.comparator}
              onChange={(e) => dlg.set("comparator", e.target.value)}
            >
              {MONITOR_COMPARATORS.map((c) => (
                <option key={c} value={c}>{COMPARATOR_LABEL[c]}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Threshold">
            <Input
              type="number"
              value={dlg.values.threshold}
              onChange={(e) => dlg.set("threshold", e.target.value)}
            />
          </FormField>
        </div>
      </FormDialog>

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
