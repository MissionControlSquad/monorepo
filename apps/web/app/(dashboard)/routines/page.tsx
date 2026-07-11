"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { ROUTINES_QUERY } from "@/lib/graphql/queries";
import { CREATE_ROUTINE, TRIGGER_ROUTINE_NOW, ADD_ROUTINE_TRIGGER } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #7: routines (scheduled/triggered workflow docs). PIPELINES_ROUTINES-gated + buildbase role
// (admin manages; member can trigger). Firing a routine creates a Task as its output.

interface Trigger {
  id: string;
  type: string;
  publicId: string | null;
  isEnabled: boolean;
}
interface Routine {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  currentVersion: number;
  triggers: Trigger[];
}

export default function RoutinesPage() {
  const [{ data }, refetch] = useQuery<{ routines: Routine[] }>({ query: ROUTINES_QUERY });
  const [, createRoutine] = useMutation(CREATE_ROUTINE);
  const [, triggerNow] = useMutation(TRIGGER_ROUTINE_NOW);
  const [, addTrigger] = useMutation(ADD_ROUTINE_TRIGGER);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    definition: '{\n  "steps": []\n}',
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, string>>({});

  const routines = data?.routines ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onCreate() {
    setError(null);
    if (!form.name.trim()) return setError("Name is required");
    let definition: unknown;
    try {
      definition = JSON.parse(form.definition);
    } catch {
      return setError("Definition must be valid JSON");
    }
    setBusy("create");
    try {
      const res = await createRoutine({
        name: form.name.trim(),
        definition,
        description: form.description.trim() || null,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to create");
      setForm({ name: "", definition: '{\n  "steps": []\n}', description: "" });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onTrigger(id: string) {
    setBusy(id);
    try {
      const res = await triggerNow({ routineId: id });
      const run = res.data?.triggerRoutineNow;
      if (run)
        setLastRun((m) => ({
          ...m,
          [id]: `${run.status} → task ${run.generatedTaskId?.slice(0, 8) ?? "—"}`,
        }));
    } finally {
      setBusy(null);
    }
  }

  async function onAddWebhook(id: string) {
    setBusy(id);
    try {
      await addTrigger({ routineId: id, type: "webhook" });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Routines</h1>
      <p className="-mt-4 text-sm text-muted-foreground">
        Reusable workflows with run history + immutable revisions. Firing a routine generates a
        task.
      </p>

      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Routine name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <textarea
          className="h-24 w-full rounded border border-border bg-background px-3 py-1.5 font-mono text-xs"
          value={form.definition}
          onChange={(e) => setForm((f) => ({ ...f, definition: e.target.value }))}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={busy === "create"} onClick={onCreate}>
            Create routine
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {routines.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No routines yet.</Card>
      )}

      {routines.map((r) => (
        <Card key={r.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{r.name}</span>
              <Badge variant="gray">v{r.currentVersion}</Badge>
              {!r.isActive && <Badge variant="gray">inactive</Badge>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === r.id}
                onClick={() => onAddWebhook(r.id)}
              >
                Add webhook
              </Button>
              <Button size="sm" disabled={busy === r.id} onClick={() => onTrigger(r.id)}>
                Run now
              </Button>
            </div>
          </div>
          {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
          {lastRun[r.id] && (
            <p className="text-xs text-muted-foreground">Last run: {lastRun[r.id]}</p>
          )}
          {r.triggers.map((t) => (
            <div key={t.id} className="text-xs text-muted-foreground">
              <Badge variant="blue">{t.type}</Badge>{" "}
              {t.publicId && <code className="break-all">/api/routines/fire/{t.publicId}</code>}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
