"use client";

import { useMutation } from "urql";
import { CREATE_BUDGET_POLICY } from "@/lib/graphql/mutations";
import { BUDGET_WINDOWS } from "@agentcenter/utils";
import { Input, Select, Checkbox, FormField, FormDialog, Tooltip } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";
import { useAppContext } from "@/components/context/AppContext";

const WINDOWS = BUDGET_WINDOWS;

// Human-readable helper lines for the scope + window pickers (surfaced as FormField hints). Keep these
// in sync with the enum members in packages/database/prisma/schema/finance.prisma.
const SCOPE_HINT =
  "Budget scope sets whose spend this limit covers: the whole workspace, or one project's agents. " +
  "On a hard breach only agents in scope are paused.";
const WINDOW_HINT =
  "Window is how often the budget resets: hourly, daily, weekly, and monthly roll over each period; " +
  "lifetime never resets — all spend accrues into one perpetual window.";

interface BudgetPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a workspace- or project-scoped budget policy. */
export function BudgetPolicyDialog({ open, onOpenChange, onSaved }: BudgetPolicyDialogProps) {
  const [, createPolicy] = useMutation(CREATE_BUDGET_POLICY);
  const { projects } = useAppContext();
  const projectList = projects ?? [];

  const f = useResourceForm({
    open,
    onOpenChange,
    empty: {
      scope: "workspace",
      projectId: "",
      name: "",
      limit: "",
      window: "monthly",
      hardStop: true,
      warn: "80",
    },
    submit: async (v) => {
      const limitCents = Math.round(Number(v.limit) * 100);
      if (!v.name.trim()) return "Name is required";
      if (v.scope === "project" && !v.projectId) return "Select a project for a project budget";
      if (!Number.isFinite(limitCents) || limitCents <= 0) return "Enter a positive limit";
      const warnPercent = Math.round(Number(v.warn));
      const res = await createPolicy({
        scope: v.scope,
        projectId: v.scope === "project" ? v.projectId : null,
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

  const isProject = f.values.scope === "project";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New budget"
      onSubmit={f.onSubmit}
      submitLabel="Add budget"
      busy={f.busy}
      error={f.error}
      submitDisabled={
        !f.values.name.trim() || !f.values.limit.trim() || (isProject && !f.values.projectId)
      }
    >
      <FormField label="Name">
        <Input
          placeholder="e.g. Monthly cap"
          value={f.values.name}
          onChange={(e) => f.set("name", e.target.value)}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Scope" hint={SCOPE_HINT}>
          <Select value={f.values.scope} onChange={(e) => f.set("scope", e.target.value)}>
            <option value="workspace">workspace</option>
            <option value="project">project</option>
          </Select>
        </FormField>
        {isProject && (
          <FormField label="Project">
            <Select value={f.values.projectId} onChange={(e) => f.set("projectId", e.target.value)}>
              <option value="">Select a project…</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FormField label="Limit ($)">
          <Input
            inputMode="decimal"
            placeholder="500"
            value={f.values.limit}
            onChange={(e) => f.set("limit", e.target.value)}
          />
        </FormField>
        <FormField label="Window" hint={WINDOW_HINT}>
          <Select value={f.values.window} onChange={(e) => f.set("window", e.target.value)}>
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Warn %">
          <Input
            inputMode="numeric"
            value={f.values.warn}
            onChange={(e) => f.set("warn", e.target.value)}
          />
        </FormField>
      </div>
      <Tooltip content="Hard stop pauses every agent in scope the instant spend passes the limit, halting further runs. Off means warn only — agents keep running past the limit.">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={f.values.hardStop}
            onChange={(e) => f.set("hardStop", e.target.checked)}
          />
          Hard stop (auto-pause agents on breach)
        </label>
      </Tooltip>
    </FormDialog>
  );
}
