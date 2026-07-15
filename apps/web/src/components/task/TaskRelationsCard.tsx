"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { TASK_RELATIONS_QUERY, TASKS_QUERY } from "@/lib/graphql/queries";
import { LINK_TASKS, UNLINK_TASKS } from "@/lib/graphql/mutations";

// Tier C: typed task dependency graph UI. Complements the single blockedBy with blocks / relates_to
// / duplicates links in both directions.
interface RelTask {
  id: string;
  title: string;
  taskNumber: number | null;
}
interface Relation {
  id: string;
  type: string;
  sourceTaskId: string;
  targetTaskId: string;
  sourceTask: RelTask | null;
  targetTask: RelTask | null;
}
interface TaskOption {
  id: string;
  title: string;
  taskNumber: number | null;
}

const TYPES = [
  { value: "blocks", label: "blocks" },
  { value: "relates_to", label: "relates to" },
  { value: "duplicates", label: "duplicates" },
];

/** Human phrasing of a relation from the current task's point of view. */
function describe(rel: Relation, taskId: string): { other: RelTask | null; label: string } {
  const outbound = rel.sourceTaskId === taskId;
  const other = outbound ? rel.targetTask : rel.sourceTask;
  if (rel.type === "blocks") return { other, label: outbound ? "blocks" : "blocked by" };
  if (rel.type === "duplicates") return { other, label: outbound ? "duplicates" : "duplicated by" };
  return { other, label: "relates to" };
}

export function TaskRelationsCard({ taskId }: { taskId: string }) {
  const [{ data }, refetch] = useQuery<{ taskRelations: Relation[] }>({
    query: TASK_RELATIONS_QUERY,
    variables: { taskId },
  });
  const [{ data: tasksData }] = useQuery<{ tasks: TaskOption[] }>({
    query: TASKS_QUERY,
    variables: { limit: 200 },
  });
  const [, linkTasks] = useMutation(LINK_TASKS);
  const [, unlinkTasks] = useMutation(UNLINK_TASKS);

  const [type, setType] = useState("relates_to");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const relations = data?.taskRelations ?? [];
  const linkedIds = new Set(
    relations.flatMap((r) => [r.sourceTaskId, r.targetTaskId]).filter((id) => id !== taskId),
  );
  const options = (tasksData?.tasks ?? []).filter((t) => t.id !== taskId && !linkedIds.has(t.id));
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    setErr(null);
    if (!target) return;
    setBusy(true);
    try {
      const res = await linkTasks({ sourceTaskId: taskId, targetTaskId: target, type });
      if (res.error) setErr(res.error.graphQLErrors[0]?.message ?? "Failed to link");
      else {
        setTarget("");
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setBusy(true);
    try {
      await unlinkTasks({ relationId: id });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">Linked issues</h3>
      <div className="space-y-1">
        {relations.length === 0 && <p className="text-xs text-muted-foreground">No links.</p>}
        {relations.map((r) => {
          const d = describe(r, taskId);
          return (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-medium text-foreground">
                  {d.other?.taskNumber != null ? `#${d.other.taskNumber} ` : ""}
                  {d.other?.title ?? "task"}
                </span>
              </span>
              <button
                className="text-xs text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => onRemove(r.id)}
                aria-label="Remove link"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded border border-border bg-background px-2 py-1 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPES.map((tp) => (
            <option key={tp.value} value={tp.value}>
              {tp.label}
            </option>
          ))}
        </select>
        <select
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">Select a task…</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.taskNumber != null ? `#${t.taskNumber} ` : ""}
              {t.title}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-foreground px-3 py-1 text-sm text-background disabled:opacity-50"
          disabled={!target || busy}
          onClick={onAdd}
        >
          Link
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
