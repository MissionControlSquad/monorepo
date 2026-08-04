"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { MONITORS_QUERY } from "@/lib/graphql/queries";
import { CREATE_MONITOR, UPDATE_MONITOR, DELETE_MONITOR } from "@/lib/graphql/mutations";
import { MONITOR_METRICS, MONITOR_COMPARATORS, monitorMetricLabel } from "@agentcenter/utils";
import type { MonitorMetric } from "@agentcenter/utils";
import { Button, Card, Badge } from "@/components/ui";

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

  const [form, setForm] = useState({
    name: "",
    metric: MONITOR_METRICS[0] as string,
    comparator: "gt",
    threshold: "0",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monitors = data?.monitors ?? [];
  const breachedCount = monitors.filter((m) => m.breached).length;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onCreate() {
    setError(null);
    if (!form.name.trim()) return setError("Name is required");
    setBusy("create");
    try {
      const res = await createMonitor({
        name: form.name.trim(),
        metric: form.metric,
        comparator: form.comparator,
        threshold: Number(form.threshold) || 0,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to create");
      setForm({ name: "", metric: MONITOR_METRICS[0], comparator: "gt", threshold: "0" });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-foreground">Monitors</h1>
        {breachedCount > 0 && <Badge variant="red">{breachedCount} breaching</Badge>}
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        Threshold alerts over live workspace metrics, evaluated on load. (Auto-firing on a schedule
        is not yet available.)
      </p>

      {/* Create */}
      <Card className="flex flex-wrap items-end gap-2 p-4">
        <input
          className="min-w-[8rem] flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Monitor name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <select
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          value={form.metric}
          onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value }))}
        >
          {MONITOR_METRICS.map((m) => (
            <option key={m} value={m}>
              {monitorMetricLabel(m as MonitorMetric)}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          value={form.comparator}
          onChange={(e) => setForm((f) => ({ ...f, comparator: e.target.value }))}
        >
          {MONITOR_COMPARATORS.map((c) => (
            <option key={c} value={c}>
              {COMPARATOR_LABEL[c]}
            </option>
          ))}
        </select>
        <input
          className="w-20 rounded border border-border bg-background px-2 py-1.5 text-sm"
          type="number"
          value={form.threshold}
          onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
        />
        <Button size="sm" disabled={busy === "create"} onClick={onCreate}>
          Add
        </Button>
      </Card>
      {error && <p className="-mt-4 text-sm text-destructive">{error}</p>}

      {monitors.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No monitors yet.</Card>
      )}
      {monitors.map((m) => (
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
            <Button
              size="sm"
              variant="danger"
              disabled={busy === m.id}
              onClick={async () => {
                setBusy(m.id);
                try {
                  await deleteMonitor({ id: m.id });
                  refresh();
                } finally {
                  setBusy(null);
                }
              }}
            >
              Delete
            </Button>
          </span>
        </Card>
      ))}
    </div>
  );
}
