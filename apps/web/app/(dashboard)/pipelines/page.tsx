"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import {
  PIPELINES_QUERY,
  CASES_IN_PIPELINE_QUERY,
  PIPELINE_HEALTH_QUERY,
} from "@/lib/graphql/queries";
import {
  CREATE_PIPELINE,
  ADD_PIPELINE_STAGE,
  CREATE_PIPELINE_CASE,
  CLAIM_CASE,
  RELEASE_CASE,
  TRANSITION_CASE,
  REJECT_CASE,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

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

function PipelineCard({ pipeline }: { pipeline: Pipeline }) {
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
  const [, transitionCase] = useMutation(TRANSITION_CASE);
  const [, rejectCase] = useMutation(REJECT_CASE);

  const [title, setTitle] = useState("");
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
      await fn();
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{pipeline.name}</span>
        {stages.map((s) => (
          <Badge
            key={s.id}
            variant={s.requireApproval ? "red" : s.isReviewStage ? "yellow" : "gray"}
          >
            {s.order}:{s.name}
            {s.requireApproval ? " 🔒" : ""}
            {s.slaMinutes ? ` (${s.slaMinutes}m)` : ""}
          </Badge>
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
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"
          >
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
              <span className="text-foreground">{c.title}</span>
              {stale.has(c.id) && <Badge variant="red">SLA breached</Badge>}
              {c.linkedTaskId && <Badge variant="blue">task</Badge>}
            </span>
            {active && (
              <span className="flex gap-2">
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
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === c.id}
                  onClick={() => act(() => rejectCase({ caseId: c.id }), c.id)}
                >
                  Reject
                </Button>
              </span>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export default function PipelinesPage() {
  const [{ data }, refetch] = useQuery<{ pipelines: Pipeline[] }>({ query: PIPELINES_QUERY });
  const [, createPipeline] = useMutation(CREATE_PIPELINE);
  const [, addStage] = useMutation(ADD_PIPELINE_STAGE);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const pipelines = data?.pipelines ?? [];

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await createPipeline({ name: name.trim() });
      const pid = res.data?.createPipeline?.id;
      if (pid) {
        // Seed a sensible default 3-stage flow (Intake → Review → Done).
        await addStage({ pipelineId: pid, name: "Intake", order: 0 });
        await addStage({
          pipelineId: pid,
          name: "Review",
          order: 1,
          isReviewStage: true,
          requireApproval: true,
        });
        await addStage({ pipelineId: pid, name: "Done", order: 2 });
      }
      setName("");
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Pipelines</h1>
      <p className="-mt-4 text-sm text-muted-foreground">
        Multi-stage case workflows. Claim a case, advance it forward through stages, or reject it.
      </p>

      <Card className="flex gap-2 p-4">
        <input
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="New pipeline name (seeds Intake → Review → Done)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button size="sm" disabled={busy} onClick={onCreate}>
          Create
        </Button>
      </Card>

      {pipelines.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No pipelines yet.</Card>
      )}
      {pipelines.map((p) => (
        <PipelineCard key={p.id} pipeline={p} />
      ))}
    </div>
  );
}
