"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import {
  PIPELINES_QUERY,
  CASES_IN_PIPELINE_QUERY,
  PIPELINE_HEALTH_QUERY,
  PIPELINE_CASE_EVENTS_QUERY,
} from "@/lib/graphql/queries";
import {
  SET_PIPELINE_SEQUENTIAL,
  UPDATE_PIPELINE_STAGE,
  DELETE_PIPELINE_STAGE,
  CREATE_PIPELINE_CASE,
  CLAIM_CASE,
  RELEASE_CASE,
  COMMENT_CASE,
  BREAKDOWN_CASE,
  TRANSITION_CASE,
  REJECT_CASE,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";
import { PipelineDialog } from "@/components/dialogs/PipelineDialog";

// Epic #7: pipelines (multi-stage case workflows). PIPELINES_ROUTINES-gated. Admin builds
// pipelines/stages; members work cases (claim → transition forward → done, or reject).

interface Stage {
  id: string;
  name: string;
  order: number;
  isReviewStage: boolean;
  requireApproval: boolean;
  slaMinutes: number | null;
}
interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  sequentialOnly: boolean;
  stages: Stage[];
}
interface Case {
  id: string;
  title: string;
  status: string;
  currentStageId: string | null;
  linkedTaskId: string | null;
}

function statusVariant(s: string): "gray" | "blue" | "yellow" | "green" | "red" {
  if (s === "rejected") return "red";
  if (s === "done") return "green";
  if (s === "in_review") return "yellow";
  if (s === "claimed" || s === "transitioned") return "blue";
  return "gray";
}

function PipelineCard({
  pipeline,
  onStagesChanged,
}: {
  pipeline: Pipeline;
  onStagesChanged: () => void;
}) {
  const stages = [...pipeline.stages].sort((a, b) => a.order - b.order);
  const [{ data: caseData }, refetchCases] = useQuery<{ casesInPipeline: Case[] }>({
    query: CASES_IN_PIPELINE_QUERY,
    variables: { pipelineId: pipeline.id },
  });
  const [{ data: healthData }, refetchHealth] = useQuery<{
    pipelineHealth: { caseId: string; title: string; minutesInStage: number; slaMinutes: number }[];
  }>({ query: PIPELINE_HEALTH_QUERY, variables: { pipelineId: pipeline.id } });

  const [, createCase] = useMutation(CREATE_PIPELINE_CASE);
  const [, claimCase] = useMutation(CLAIM_CASE);
  const [, releaseCase] = useMutation(RELEASE_CASE);
  const [, breakdownCase] = useMutation(BREAKDOWN_CASE);
  const [, transitionCase] = useMutation(TRANSITION_CASE);
  const [, rejectCase] = useMutation(REJECT_CASE);
  const [, updateStage] = useMutation(UPDATE_PIPELINE_STAGE);
  const [, deleteStage] = useMutation(DELETE_PIPELINE_STAGE);
  const [, setSequential] = useMutation(SET_PIPELINE_SEQUENTIAL);

  const [title, setTitle] = useState("");
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cases = caseData?.casesInPipeline ?? [];
  const stale = new Set((healthData?.pipelineHealth ?? []).map((h) => h.caseId));
  function refresh() {
    refetchCases({ requestPolicy: "network-only" });
    refetchHealth({ requestPolicy: "network-only" });
  }

  function nextStageId(currentStageId: string | null): string | null {
    const idx = stages.findIndex((s) => s.id === currentStageId);
    return idx >= 0 && idx < stages.length - 1 ? stages[idx + 1].id : null;
  }

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
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{pipeline.name}</span>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={pipeline.sequentialOnly}
            onChange={async (e) => {
              await setSequential({
                pipelineId: pipeline.id,
                sequentialOnly: e.target.checked,
              });
              onStagesChanged();
            }}
          />
          sequential
        </label>
        {stages.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5"
          >
            <Badge variant={s.requireApproval ? "red" : s.isReviewStage ? "yellow" : "gray"}>
              {s.order}:{s.name}
              {s.requireApproval ? " 🔒" : ""}
              {s.slaMinutes ? ` (${s.slaMinutes}m)` : ""}
            </Badge>
            <button
              title="toggle approval gate"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await updateStage({ stageId: s.id, requireApproval: !s.requireApproval });
                onStagesChanged();
              }}
            >
              🔒
            </button>
            <button
              title="delete stage"
              className="text-xs text-destructive"
              onClick={async () => {
                const res = await deleteStage({ stageId: s.id });
                if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Cannot delete stage");
                else onStagesChanged();
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="New case title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          size="sm"
          disabled={!title.trim() || busy === "create"}
          onClick={() =>
            act(async () => {
              await createCase({ pipelineId: pipeline.id, title: title.trim() });
              setTitle("");
            }, "create")
          }
        >
          Add case
        </Button>
      </div>

      {cases.length === 0 && <p className="text-xs text-muted-foreground">No cases.</p>}
      {cases.map((c) => {
        const next = nextStageId(c.currentStageId);
        const active = c.status !== "rejected" && c.status !== "done";
        return (
          <div key={c.id} className="border-t border-border pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                <span className="text-foreground">{c.title}</span>
                {stale.has(c.id) && <Badge variant="red">SLA breached</Badge>}
                {c.linkedTaskId && <Badge variant="blue">task</Badge>}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenCase((o) => (o === c.id ? null : c.id))}
                >
                  History
                </Button>
                {active && (
                  <>
                    {c.status === "open" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === c.id}
                        onClick={() => act(() => claimCase({ caseId: c.id }), c.id)}
                      >
                        Claim
                      </Button>
                    )}
                    {c.status === "claimed" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === c.id}
                        onClick={() => act(() => releaseCase({ caseId: c.id }), c.id)}
                      >
                        Release
                      </Button>
                    )}
                    {next && (
                      <Button
                        size="sm"
                        disabled={busy === c.id}
                        onClick={() =>
                          act(() => transitionCase({ caseId: c.id, toStageId: next }), c.id)
                        }
                      >
                        Advance
                      </Button>
                    )}
                    {!c.linkedTaskId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === c.id}
                        onClick={() =>
                          act(
                            () =>
                              breakdownCase({
                                caseId: c.id,
                                title: c.title,
                                description: `Broken down from pipeline case "${c.title}"`,
                              }),
                            c.id,
                          )
                        }
                      >
                        Break down
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy === c.id}
                      onClick={() => act(() => rejectCase({ caseId: c.id }), c.id)}
                    >
                      Reject
                    </Button>
                  </>
                )}
              </span>
            </div>
            {openCase === c.id && <CaseTimeline caseId={c.id} />}
          </div>
        );
      })}
    </Card>
  );
}

export default function PipelinesPage() {
  const [{ data }, refetch] = useQuery<{ pipelines: Pipeline[] }>({ query: PIPELINES_QUERY });

  const [open, setOpen] = useState(false);
  const pipelines = data?.pipelines ?? [];

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Pipelines</h1>
          <p className="text-sm text-muted-foreground">
            Multi-stage case workflows. Claim a case, advance it forward through stages, or reject it.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>New pipeline</Button>
      </div>

      <PipelineDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={() => refetch({ requestPolicy: "network-only" })}
      />

      {pipelines.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No pipelines yet.</Card>
      )}
      {pipelines.map((p) => (
        <PipelineCard
          key={p.id}
          pipeline={p}
          onStagesChanged={() => refetch({ requestPolicy: "network-only" })}
        />
      ))}
    </div>
  );
}

interface CaseEvent {
  id: string;
  type: string;
  note: string | null;
  actorProfileId: string | null;
  createdAt: string;
}

function CaseTimeline({ caseId }: { caseId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ pipelineCaseEvents: CaseEvent[] }>({
    query: PIPELINE_CASE_EVENTS_QUERY,
    variables: { caseId },
  });
  const [, commentCase] = useMutation(COMMENT_CASE);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const events = data?.pipelineCaseEvents ?? [];

  async function onComment() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await commentCase({ caseId, note: note.trim() });
      setNote("");
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Timeline</p>
      {fetching && <p className="text-xs text-muted-foreground">Loading…</p>}
      {events.length === 0 && !fetching && (
        <p className="text-xs text-muted-foreground">No events yet.</p>
      )}
      {events.map((e) => (
        <div key={e.id} className="flex items-start gap-2 text-xs">
          <Badge variant={e.type === "commented" ? "blue" : "gray"}>{e.type}</Badge>
          <span className="flex-1">
            {e.note && <span className="text-foreground">{e.note}</span>}
            <span className="ml-1 text-muted-foreground">
              {new Date(e.createdAt).toLocaleString()}
            </span>
          </span>
        </div>
      ))}
      <div className="flex gap-2 border-t border-border pt-2">
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          placeholder="Add a comment"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onComment();
          }}
        />
        <Button size="sm" variant="secondary" disabled={busy || !note.trim()} onClick={onComment}>
          Comment
        </Button>
      </div>
    </div>
  );
}
