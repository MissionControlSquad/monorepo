"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { TASK_LABELS_QUERY } from "@/lib/graphql/queries";
import { ADD_TASK_LABEL, REMOVE_TASK_LABEL } from "@/lib/graphql/mutations";

// Parity §3.12 — first-class task labels: structured, colored labels beyond the freeform tags[].
interface TaskLabel {
  id: string;
  labelId: string;
  label: { id: string; name: string; color: string };
}

/** Pick a readable text color for a given background hex (WCAG-ish luminance threshold). */
function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

export function TaskLabelsCard({ taskId }: { taskId: string }) {
  const [{ data }, refetch] = useQuery<{ taskLabels: TaskLabel[] }>({
    query: TASK_LABELS_QUERY,
    variables: { taskId },
  });
  const [, addLabel] = useMutation(ADD_TASK_LABEL);
  const [, removeLabel] = useMutation(REMOVE_TASK_LABEL);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const labels = data?.taskLabels ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    setErr(null);
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await addLabel({ taskId, name: name.trim(), color });
      if (res.error) setErr(res.error.graphQLErrors[0]?.message ?? "Failed to add label");
      else {
        setName("");
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(labelId: string) {
    setBusy(true);
    try {
      await removeLabel({ taskId, labelId });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground" title="Structured labels beyond freeform tags">
        Labels
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {labels.length === 0 && <p className="text-xs text-muted-foreground">No labels.</p>}
        {labels.map((tl) => (
          <span
            key={tl.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: tl.label.color, color: readableText(tl.label.color) }}
          >
            {tl.label.name}
            <button
              className="opacity-70 hover:opacity-100"
              disabled={busy}
              onClick={() => onRemove(tl.labelId)}
              aria-label={`Remove label ${tl.label.name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          className="h-7 w-8 cursor-pointer rounded border border-border bg-background p-0.5"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Label color"
          title="Label color"
        />
        <input
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
          placeholder="Add a label…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <button
          className="rounded bg-foreground px-3 py-1 text-sm text-background disabled:opacity-50"
          disabled={!name.trim() || busy}
          onClick={onAdd}
        >
          Add
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
