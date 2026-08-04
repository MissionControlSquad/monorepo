"use client";

import { useMutation } from "urql";
import { CREATE_MONITOR } from "@/lib/graphql/mutations";
import { MONITOR_METRICS, MONITOR_COMPARATORS, monitorMetricLabel } from "@agentcenter/utils";
import type { MonitorMetric } from "@agentcenter/utils";
import { Input, Select, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const COMPARATOR_LABEL: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

interface MonitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a workspace health monitor (named threshold over a metric). */
export function MonitorDialog({ open, onOpenChange, onSaved }: MonitorDialogProps) {
  const [, createMonitor] = useMutation(CREATE_MONITOR);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", metric: MONITOR_METRICS[0] as string, comparator: "gt", threshold: "0" },
    submit: async (v) => {
      if (!v.name.trim()) return "Name is required";
      const r = await createMonitor({
        name: v.name.trim(),
        metric: v.metric,
        comparator: v.comparator,
        threshold: Number(v.threshold) || 0,
      });
      return r.error?.graphQLErrors?.[0]?.message ?? r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New monitor"
      description="Alert when a workspace metric crosses a threshold."
      onSubmit={f.onSubmit}
      submitLabel="Add monitor"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <FormField label="Name">
        <Input
          placeholder="e.g. Too many blocked agents"
          value={f.values.name}
          onChange={(e) => f.set("name", e.target.value)}
        />
      </FormField>
      <FormField label="Metric">
        <Select
          value={f.values.metric}
          onChange={(e) => f.set("metric", e.target.value)}
        >
          {MONITOR_METRICS.map((m) => (
            <option key={m} value={m}>{monitorMetricLabel(m as MonitorMetric)}</option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Comparator">
          <Select
            value={f.values.comparator}
            onChange={(e) => f.set("comparator", e.target.value)}
          >
            {MONITOR_COMPARATORS.map((c) => (
              <option key={c} value={c}>{COMPARATOR_LABEL[c]}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Threshold">
          <Input type="number" value={f.values.threshold} onChange={(e) => f.set("threshold", e.target.value)} />
        </FormField>
      </div>
    </FormDialog>
  );
}
