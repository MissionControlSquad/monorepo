"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { X } from "lucide-react";
import { CenteredSpinner, CenteredMessage } from "@/components/common/AsyncBoundary";
import { CASE_QUERY, CASE_EVENTS_QUERY, LABELS_QUERY } from "@/lib/graphql/queries";
import {
  UPDATE_CASE,
  SET_CASE_STATUS,
  ADD_CASE_LABEL,
  REMOVE_CASE_LABEL,
  UNLINK_TASK_FROM_CASE,
} from "@/lib/graphql/mutations";
import { Breadcrumbs, Card, Badge, PageLayout, Textarea } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { CASE_STATES } from "@agentcenter/utils";

// Epic #17: case detail — identifier/title/type/status, editable summary, custom fields (JSON),
// labels (add/remove), linked tasks (with unlink), attached documents, and the event timeline.

interface LabelRow {
  id: string;
  label: { id: string; name: string; color: string };
}
interface TaskLink {
  id: string;
  taskId: string;
  role: string;
  task?: { id: string; title: string; taskNumber: number; status: string } | null;
}
interface CaseDoc {
  id: string;
  key: string;
  document?: { id: string; title: string } | null;
}
interface CaseFull {
  id: string;
  identifier: string;
  caseType: string;
  title: string;
  summary: string | null;
  status: string;
  fields: Record<string, unknown> | null;
  parentCaseId: string | null;
  labels: LabelRow[];
  documents: CaseDoc[];
  taskLinks: TaskLink[];
}
interface CaseEvent {
  id: string;
  kind: string;
  actorType: string;
  createdAt: string;
}

export function CaseDetailPage({ caseId }: { caseId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ case: CaseFull | null }>({
    query: CASE_QUERY,
    variables: { id: caseId },
  });
  const [{ data: eventsData }] = useQuery<{ caseEvents: CaseEvent[] }>({
    query: CASE_EVENTS_QUERY,
    variables: { caseId, limit: 50 },
  });
  const [{ data: labelsData }] = useQuery<{
    labels: { id: string; name: string; color: string }[];
  }>({ query: LABELS_QUERY });
  const [, updateCase] = useMutation(UPDATE_CASE);
  const [, setStatus] = useMutation(SET_CASE_STATUS);
  const [, addLabel] = useMutation(ADD_CASE_LABEL);
  const [, removeLabel] = useMutation(REMOVE_CASE_LABEL);
  const [, unlinkTask] = useMutation(UNLINK_TASK_FROM_CASE);

  const kase = data?.case;
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kase) setSummary(kase.summary ?? "");
  }, [kase]);

  const allLabels = useMemo(() => labelsData?.labels ?? [], [labelsData]);
  const usedLabelIds = useMemo(() => new Set((kase?.labels ?? []).map((l) => l.label.id)), [kase]);
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function run(fn: () => Promise<{ error?: unknown }>, ok?: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.error) {
        toast.error(String((res.error as Error).message).replace("[GraphQL] ", ""));
        return;
      }
      if (ok) toast.success(ok);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (fetching && !kase) return <CenteredSpinner />;
  if (!kase) return <CenteredMessage>Case not found</CenteredMessage>;

  const fieldEntries = Object.entries(kase.fields ?? {});

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Cases", href: "/cases" },
          { label: kase.identifier },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card padding="lg" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{kase.identifier}</span>
              <Badge variant="gray">{kase.caseType}</Badge>
            </div>
            <h1 className="text-lg font-semibold text-foreground">{kase.title}</h1>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={() =>
                summary !== (kase.summary ?? "") &&
                run(() => updateCase({ id: caseId, summary }), "Summary saved")
              }
              rows={4}
              placeholder="Summary…"
              className="resize-y rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Card>

          {fieldEntries.length > 0 && (
            <Card padding="lg" className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Fields</h2>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {fieldEntries.map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border p-2">
                    <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                    <dd className="truncate text-sm text-foreground">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          {/* Linked tasks */}
          <Card padding="lg" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Linked tasks ({kase.taskLinks.length})
            </h2>
            {kase.taskLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks linked.</p>
            ) : (
              <ul className="space-y-2">
                {kase.taskLinks.map((tl) => (
                  <li
                    key={tl.id}
                    className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm"
                  >
                    <Link href={`/task/${tl.taskId}`} className="min-w-0 truncate hover:underline">
                      {tl.task ? `#${tl.task.taskNumber} ${tl.task.title}` : tl.taskId}
                    </Link>
                    <span className="flex items-center gap-2">
                      <Badge variant="gray" size="sm">
                        {tl.role}
                      </Badge>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() =>
                          run(() => unlinkTask({ caseId, taskId: tl.taskId }), "Task unlinked")
                        }
                        title="Unlink task"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Documents */}
          {kase.documents.length > 0 && (
            <Card padding="lg" className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">
                Documents ({kase.documents.length})
              </h2>
              <ul className="space-y-1.5">
                {kase.documents.map((d) => (
                  <li key={d.id} className="rounded-lg border border-border p-2 text-sm">
                    <span className="text-muted-foreground">{d.key}: </span>
                    {d.document?.title ?? d.document?.id ?? "—"}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card padding="lg" className="space-y-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <Select
                value={kase.status}
                onValueChange={(v) =>
                  run(() => setStatus({ id: caseId, status: v }), "Status updated")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Labels</span>
              <div className="flex flex-wrap gap-1.5">
                {kase.labels.map((cl) => (
                  <button
                    key={cl.id}
                    className="rounded bg-muted px-2 py-0.5 text-xs text-foreground hover:line-through"
                    disabled={busy}
                    onClick={() => run(() => removeLabel({ caseId, labelId: cl.label.id }))}
                    title="Remove label"
                  >
                    {cl.label.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-1.5">
                {allLabels
                  .filter((l) => !usedLabelIds.has(l.id))
                  .map((l) => (
                    <button
                      key={l.id}
                      className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                      disabled={busy}
                      onClick={() => run(() => addLabel({ caseId, labelId: l.id }))}
                    >
                      + {l.name}
                    </button>
                  ))}
              </div>
            </div>
          </Card>

          {/* Events */}
          <Card padding="lg" className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Activity</h2>
            <ul className="space-y-2">
              {(eventsData?.caseEvents ?? []).map((e) => (
                <li key={e.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{e.kind.replace("_", " ")}</span> ·{" "}
                  {e.actorType}
                </li>
              ))}
              {(eventsData?.caseEvents?.length ?? 0) === 0 && (
                <li className="text-xs text-muted-foreground">No activity yet.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
