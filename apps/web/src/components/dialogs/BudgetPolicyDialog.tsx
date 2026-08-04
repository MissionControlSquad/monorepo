"use client";

import { useMutation } from "urql";
import { CREATE_BUDGET_POLICY } from "@/lib/graphql/mutations";
import { BUDGET_WINDOWS } from "@agentcenter/utils";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const WINDOWS = BUDGET_WINDOWS;

interface BudgetPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a workspace budget policy. */
export function BudgetPolicyDialog({ open, onOpenChange, onSaved }: BudgetPolicyDialogProps) {
  const [, createPolicy] = useMutation(CREATE_BUDGET_POLICY);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", limit: "", window: "monthly", hardStop: true, warn: "80" },
    submit: async (v) => {
      const limitCents = Math.round(Number(v.limit) * 100);
      if (!v.name.trim()) return "Name is required";
      if (!Number.isFinite(limitCents) || limitCents <= 0) return "Enter a positive limit";
      const warnPercent = Math.round(Number(v.warn));
      const res = await createPolicy({
        scope: "workspace",
        name: v.name.trim(),
        limitCents,
        window: v.window,
        hardStop: v.hardStop,
        warnPercent: Number.isFinite(warnPercent) ? warnPercent : 80,
      });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New workspace budget"
      onSubmit={f.onSubmit}
      submitLabel="Add budget"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim() || !f.values.limit.trim()}
    >
      <FormField label="Name">
        <Input placeholder="e.g. Monthly cap" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Limit ($)">
          <Input inputMode="decimal" placeholder="500" value={f.values.limit} onChange={(e) => f.set("limit", e.target.value)} />
        </FormField>
        <FormField label="Window">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={f.values.window}
            onChange={(e) => f.set("window", e.target.value)}
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Warn %">
          <Input inputMode="numeric" value={f.values.warn} onChange={(e) => f.set("warn", e.target.value)} />
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={f.values.hardStop} onChange={(e) => f.set("hardStop", e.target.checked)} />
        Hard stop (auto-pause agents on breach)
      </label>
    </FormDialog>
  );
}
