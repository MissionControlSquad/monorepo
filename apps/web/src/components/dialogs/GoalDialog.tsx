"use client";

import { useQuery, useMutation } from "urql";
import { GOAL_LEVELS } from "@agentcenter/utils";
import { GOALS_QUERY } from "@/lib/graphql/queries";
import { CREATE_GOAL } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const LEVELS = GOAL_LEVELS;

interface GoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a hierarchical goal. Self-contained: queries existing goals for the parent picker. */
export function GoalDialog({ open, onOpenChange, onSaved }: GoalDialogProps) {
  const [{ data }] = useQuery<{ goals: { id: string; title: string }[] }>({
    query: GOALS_QUERY,
    pause: !open,
  });
  const goals = data?.goals ?? [];
  const [, createGoal] = useMutation(CREATE_GOAL);

  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { title: "", level: "task", parentId: "" },
    submit: async (v) => {
      if (!v.title.trim()) return "Title is required";
      const r = await createGoal({
        title: v.title.trim(),
        level: v.level,
        parentId: v.parentId || undefined,
      });
      return r.error?.graphQLErrors?.[0]?.message ?? r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New goal"
      onSubmit={f.onSubmit}
      submitLabel="Add goal"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.title.trim()}
    >
      <FormField label="Title">
        <Input
          placeholder="e.g. Ship checkout v2"
          value={f.values.title}
          onChange={(e) => f.set("title", e.target.value)}
        />
      </FormField>
      <FormField label="Level">
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={f.values.level}
          onChange={(e) => f.set("level", e.target.value)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Parent goal">
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={f.values.parentId}
          onChange={(e) => f.set("parentId", e.target.value)}
        >
          <option value="">No parent</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>under: {g.title}</option>
          ))}
        </select>
      </FormField>
    </FormDialog>
  );
}
