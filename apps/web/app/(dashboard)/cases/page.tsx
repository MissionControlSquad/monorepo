"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { Ticket } from "lucide-react";
import { CASES_QUERY, LABELS_QUERY } from "@/lib/graphql/queries";
import {
  SET_CASE_STATUS,
  ADD_CASE_LABEL,
  REMOVE_CASE_LABEL,
} from "@/lib/graphql/mutations";
import { CASE_STATES, CaseState } from "@agentcenter/utils";
import { Button, Card, Badge, EmptyState } from "@/components/ui";
import { CaseDialog } from "@/components/dialogs/CaseDialog";
import { LabelDialog } from "@/components/dialogs/LabelDialog";

// Epic #17: cases (support-ticket / work-item). CASES-gated + buildbase role (member works cases;
// admin curates the label catalog). Distinct from pipeline cases (Epic #7).

const STATES = CASE_STATES;

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
  if (s === CaseState.DONE || s === CaseState.APPROVED) return "green";
  if (s === CaseState.CANCELLED) return "red";
  if (s === CaseState.IN_REVIEW) return "yellow";
  if (s === CaseState.IN_PROGRESS) return "blue";
  return "gray";
}

export default function CasesPage() {
  const [{ data }, refetch] = useQuery<{ cases: CaseRow[] }>({ query: CASES_QUERY });
  const [{ data: labelData }, refetchLabels] = useQuery<{ labels: Label[] }>({
    query: LABELS_QUERY,
  });
  const [, setStatus] = useMutation(SET_CASE_STATUS);
  const [, addLabel] = useMutation(ADD_CASE_LABEL);
  const [, removeLabel] = useMutation(REMOVE_CASE_LABEL);

  const [busy, setBusy] = useState<string | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const cases = data?.cases ?? [];
  const labels = labelData?.labels ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function act(fn: () => Promise<unknown>, key: string) {
    setBusy(key);
    try {
      const r = await fn();
      if (r && typeof r === "object" && "error" in r && r.error) {
        const err = r.error as { graphQLErrors?: { message: string }[]; message?: string };
        toast.error(err.graphQLErrors?.[0]?.message ?? err.message ?? "Something went wrong");
        return;
      }
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Cases</h1>
          <p className="text-sm text-muted-foreground">
            Support tickets / work items with labels, task links, and a full event timeline.
          </p>
        </div>
        <Button onClick={() => setCaseOpen(true)}>New case</Button>
      </div>

      <CaseDialog open={caseOpen} onOpenChange={setCaseOpen} onSaved={refresh} />
      <LabelDialog
        open={labelOpen}
        onOpenChange={setLabelOpen}
        onSaved={() => refetchLabels({ requestPolicy: "network-only" })}
      />

      {/* Label catalog (display + open the create-label modal) */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs text-muted-foreground">Labels:</span>
        {labels.length === 0 && <span className="text-xs text-muted-foreground">none yet</span>}
        {labels.map((l) => (
          <Badge key={l.id} variant="gray">{l.name}</Badge>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setLabelOpen(true)}>
          + Label
        </Button>
      </Card>

      {cases.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-8 w-8" />}
          title="No cases yet"
          description="Open a case to track a support ticket or work item."
        />
      ) : (
        cases.map((c) => {
          const usedLabelIds = new Set(c.labels.map((x) => x.label.id));
          return (
            <Card key={c.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{c.identifier}</span>
                  <Link href={`/cases/${c.id}`} className="font-medium text-foreground hover:underline">
                    {c.title}
                  </Link>
                  <Badge variant="gray">{c.caseType}</Badge>
                </span>
                <select
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                  value={c.status}
                  disabled={busy === c.id}
                  onChange={(e) => act(() => setStatus({ id: c.id, status: e.target.value }), c.id)}
                >
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.labels.map((cl) => (
                  <button
                    key={cl.id}
                    className="rounded bg-muted px-2 py-0.5 text-xs text-foreground hover:line-through"
                    disabled={busy === c.id}
                    onClick={() => act(() => removeLabel({ caseId: c.id, labelId: cl.label.id }), c.id)}
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
        })
      )}
    </div>
  );
}
