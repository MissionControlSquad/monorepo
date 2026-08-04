"use client";

import { useQuery, useMutation } from "urql";
import { AGENTS_QUERY, GOALS_QUERY } from "@/lib/graphql/queries";
import { CREATE_ROUTINE } from "@/lib/graphql/mutations";
import { Input, Select, Textarea, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

interface RoutineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a routine. Self-contained: queries agents + goals for the pickers. */
export function RoutineDialog({ open, onOpenChange, onSaved }: RoutineDialogProps) {
  const [{ data: agentsData }] = useQuery<{ agents: { id: string; name: string }[] }>({
    query: AGENTS_QUERY,
    pause: !open,
  });
  const [{ data: goalsData }] = useQuery<{ goals: { id: string; title: string }[] }>({
    query: GOALS_QUERY,
    pause: !open,
  });
  const agents = agentsData?.agents ?? [];
  const goals = goalsData?.goals ?? [];
  const [, createRoutine] = useMutation(CREATE_ROUTINE);

  const f = useResourceForm({
    open,
    onOpenChange,
    empty: {
      name: "",
      description: "",
      assigneeAgentId: "",
      priority: "",
      goalId: "",
      definition: '{\n  "steps": []\n}',
    },
    submit: async (v) => {
      if (!v.name.trim()) return "Name is required";
      let definition: unknown;
      try {
        definition = JSON.parse(v.definition);
      } catch {
        return "Definition must be valid JSON";
      }
      const res = await createRoutine({
        name: v.name.trim(),
        definition,
        description: v.description.trim() || null,
        assigneeAgentId: v.assigneeAgentId || null,
        priority: v.priority || null,
        goalId: v.goalId || null,
      });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New routine"
      onSubmit={f.onSubmit}
      submitLabel="Create routine"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <FormField label="Name">
        <Input placeholder="Routine name" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
      <FormField label="Description (optional)">
        <Input value={f.values.description} onChange={(e) => f.set("description", e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Assignee (optional)">
          <Select
            value={f.values.assigneeAgentId}
            onChange={(e) => f.set("assigneeAgentId", e.target.value)}
          >
            <option value="">None</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Priority (optional)">
          <Select
            value={f.values.priority}
            onChange={(e) => f.set("priority", e.target.value)}
          >
            <option value="">None</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Goal (optional)">
          <Select
            value={f.values.goalId}
            onChange={(e) => f.set("goalId", e.target.value)}
          >
            <option value="">None</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Definition (JSON)">
        <Textarea
          className="h-32 font-mono text-xs"
          value={f.values.definition}
          onChange={(e) => f.set("definition", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
