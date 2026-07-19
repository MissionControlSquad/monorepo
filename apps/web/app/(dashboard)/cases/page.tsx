"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { CASES_QUERY, LABELS_QUERY } from "@/lib/graphql/queries";
import {
  CREATE_CASE,
  SET_CASE_STATUS,
  CREATE_LABEL,
  ADD_CASE_LABEL,
  REMOVE_CASE_LABEL,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #17: cases (support-ticket / work-item). CASES-gated + buildbase role (member works cases;
// admin curates the label catalog). Distinct from pipeline cases (Epic #7).

const STATES = ["draft", "in_progress", "in_review", "approved", "done", "cancelled"] as const;

interface Label {
  id: string;
  name: string;
  color: string;
}
interface CaseRow {
  id: string;
  identifier: string;
  title: string;
  caseType: string;
  status: string;
  labels: { id: string; label: Label }[];
}

function statusVariant(s: string): "gray" | "blue" | "yellow" | "green" | "red" {
  if (s === "done" || s === "approved") return "green";
  if (s === "cancelled") return "red";
  if (s === "in_review") return "yellow";
  if (s === "in_progress") return "blue";
  return "gray";
}

export default function CasesPage() {
  const [{ data }, refetch] = useQuery<{ cases: CaseRow[] }>({ query: CASES_QUERY });
  const [{ data: labelData }, refetchLabels] = useQuery<{ labels: Label[] }>({
    query: LABELS_QUERY,
  });
  const [, createCase] = useMutation(CREATE_CASE);
  const [, setStatus] = useMutation(SET_CASE_STATUS);
  const [, createLabel] = useMutation(CREATE_LABEL);
  const [, addLabel] = useMutation(ADD_CASE_LABEL);
  const [, removeLabel] = useMutation(REMOVE_CASE_LABEL);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", caseType: "bug" });
  const [labelForm, setLabelForm] = useState({ name: "", color: "#6366f1" });
  const [error, setError] = useState<string | null>(null);

  const cases = data?.cases ?? [];
  const labels = labelData?.labels ?? [];
  function refresh() {
    refetch({ requestPolicy: "network-only" });
  }
  async function act(fn: () => Promise<unknown>, key: string) {
    setBusy(key);
    try {
      await fn();
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onCreate() {
    setError(null);
    if (!form.title.trim()) return setError("Title is required");
    const res = await createCase({
      title: form.title.trim(),
      caseType: form.caseType.trim() || "bug",
    });
    if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to create");
    setForm({ title: "", caseType: "bug" });
    refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Cases</h1>
      <p className="-mt-4 text-sm text-muted-foreground">
        Support tickets / work items with labels, task links, and a full event timeline.
      </p>

      {/* Create case */}
      <Card className="flex flex-wrap gap-2 p-4">
        <input
          className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Case title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <input
          className="w-32 rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Type"
          value={form.caseType}
          onChange={(e) => setForm((f) => ({ ...f, caseType: e.target.value }))}
        />
        <Button size="sm" onClick={onCreate}>
          Open case
        </Button>
      </Card>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Label catalog (admin) */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs text-muted-foreground">Labels:</span>
        {labels.map((l) => (
          <Badge key={l.id} variant="gray">
            {l.name}
          </Badge>
        ))}
        <input
          className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
          placeholder="new label"
          value={labelForm.name}
          onChange={(e) => setLabelForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!labelForm.name.trim() || busy === "label"}
          onClick={() =>
            act(async () => {
              await createLabel({ name: labelForm.name.trim(), color: labelForm.color });
              setLabelForm({ name: "", color: "#6366f1" });
              refetchLabels({ requestPolicy: "network-only" });
            }, "label")
          }
        >
          Add label
        </Button>
      </Card>

      {cases.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No cases yet.</Card>
      )}

      {cases.map((c) => {
        const usedLabelIds = new Set(c.labels.map((x) => x.label.id));
        return (
          <Card key={c.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{c.identifier}</span>
                <span className="font-medium text-foreground">{c.title}</span>
                <Badge variant="gray">{c.caseType}</Badge>
              </span>
              <select
                className="rounded border border-border bg-background px-2 py-1 text-sm"
                value={c.status}
                disabled={busy === c.id}
                onChange={(e) => act(() => setStatus({ id: c.id, status: e.target.value }), c.id)}
              >
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.labels.map((cl) => (
                <button
                  key={cl.id}
                  className="rounded bg-muted px-2 py-0.5 text-xs text-foreground hover:line-through"
                  disabled={busy === c.id}
                  onClick={() =>
                    act(() => removeLabel({ caseId: c.id, labelId: cl.label.id }), c.id)
                  }
                  title="Remove label"
                >
                  {cl.label.name} ✕
                </button>
              ))}
              {labels
                .filter((l) => !usedLabelIds.has(l.id))
                .map((l) => (
                  <button
                    key={l.id}
                    className="rounded border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    disabled={busy === c.id}
                    onClick={() => act(() => addLabel({ caseId: c.id, labelId: l.id }), c.id)}
                    title="Add label"
                  >
                    + {l.name}
                  </button>
                ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
