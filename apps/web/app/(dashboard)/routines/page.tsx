"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { ROUTINES_QUERY, AGENTS_QUERY, GOALS_QUERY } from "@/lib/graphql/queries";
import {
  TRIGGER_ROUTINE_NOW,
  ADD_ROUTINE_TRIGGER,
  UPDATE_ROUTINE,
  REGENERATE_TRIGGER_PUBLIC_ID,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";
import { RoutineDialog } from "@/components/dialogs/RoutineDialog";

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
  assigneeAgentId: string | null;
  priority: string | null;
  goalId: string | null;
  triggers: Trigger[];
}

export default function RoutinesPage() {
  const [{ data }, refetch] = useQuery<{ routines: Routine[] }>({ query: ROUTINES_QUERY });
  const [{ data: agentsData }] = useQuery<{ agents: { id: string; name: string }[] }>({
    query: AGENTS_QUERY,
  });
  const [{ data: goalsData }] = useQuery<{ goals: { id: string; title: string }[] }>({
    query: GOALS_QUERY,
  });
  const [, triggerNow] = useMutation(TRIGGER_ROUTINE_NOW);
  const [, addTrigger] = useMutation(ADD_ROUTINE_TRIGGER);
  const [, updateRoutine] = useMutation(UPDATE_ROUTINE);
  const [, regenerateTrigger] = useMutation(REGENERATE_TRIGGER_PUBLIC_ID);

  const agents = agentsData?.agents ?? [];
  const goals = goalsData?.goals ?? [];

  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [lastRun, setLastRun] = useState<Record<string, string>>({});

  const routines = data?.routines ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onRegenerateTrigger(triggerId: string, routineId: string) {
    setBusy(routineId);
    try {
      await regenerateTrigger({ triggerId });
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  async function onToggleActive(id: string, isActive: boolean) {
    setBusy(id);
    try {
      await updateRoutine({ id, isActive });
      refetch({ requestPolicy: "network-only" });
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
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Routines</h1>
          <p className="text-sm text-muted-foreground">
            Reusable workflows with run history + immutable revisions. Firing a routine generates a task.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>New routine</Button>
      </div>

      <RoutineDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

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
              {r.priority && <Badge variant="yellow">{r.priority}</Badge>}
              {r.assigneeAgentId && (
                <Badge variant="blue">
                  → {agents.find((a) => a.id === r.assigneeAgentId)?.name ?? "agent"}
                </Badge>
              )}
              {r.goalId && (
                <Badge variant="purple">
                  ◎ {goals.find((g) => g.id === r.goalId)?.title ?? "goal"}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === r.id}
                onClick={() => onToggleActive(r.id, !r.isActive)}
              >
                {r.isActive ? "Pause" : "Activate"}
              </Button>
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
            <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="blue">{t.type}</Badge>
              {t.publicId && (
                <>
                  <code className="break-all">/api/routines/fire/{t.publicId}</code>
                  <button
                    className="text-muted-foreground underline hover:text-foreground"
                    disabled={busy === r.id}
                    onClick={() => onRegenerateTrigger(t.id, r.id)}
                    title="Rotate this webhook URL (invalidates the old one)"
                  >
                    regenerate
                  </button>
                </>
              )}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
