"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "urql";
import { CenteredSpinner, CenteredMessage } from "@/components/common/AsyncBoundary";
import {
  PIPELINE_QUERY,
  PIPELINE_STATS_QUERY,
  CASES_IN_PIPELINE_QUERY,
  PIPELINE_HEALTH_QUERY,
  PIPELINE_CASE_EVENTS_QUERY,
} from "@/lib/graphql/queries";
import { Breadcrumbs, Card, Badge, PageLayout } from "@/components/ui";
import { useFeatureFlags } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  sortStages,
  caseCountsByStage,
  caseStatusVariant,
  formatTimestamp,
} from "@/lib/work-detail";

// Detail route for a single pipeline (Epic #7). Reuses the existing pipeline / pipelineStats /
// casesInPipeline / pipelineHealth / pipelineCaseEvents reads — no new server data. Read-only view:
// stages, aggregate stats, cases in the pipeline (with SLA health), and a per-case event timeline.

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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  stages: Stage[];
}
interface CaseRow {
  id: string;
  title: string;
  status: string;
  currentStageId: string | null;
  linkedTaskId: string | null;
}
interface Health {
  caseId: string;
  title: string;
  minutesInStage: number;
  slaMinutes: number;
}
interface StageCount {
  stageId: string;
  stageName: string;
  count: number;
}
interface Stats {
  activeCount: number;
  doneCount: number;
  rejectedCount: number;
  staleCount: number;
  completedLast24h: number;
  byStage: StageCount[];
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold text-foreground">{value}</dd>
    </div>
  );
}

export function PipelineDetailPage({ pipelineId }: { pipelineId: string }) {
  const { isEnabled } = useFeatureFlags();
  const enabled = isEnabled(FLAG_KEYS.PIPELINES_ROUTINES);

  const [{ data, fetching, error }] = useQuery<{ pipeline: Pipeline | null }>({
    query: PIPELINE_QUERY,
    variables: { id: pipelineId },
    pause: !enabled,
  });
  const [{ data: statsData }] = useQuery<{ pipelineStats: Stats }>({
    query: PIPELINE_STATS_QUERY,
    variables: { pipelineId },
    pause: !enabled,
  });
  const [{ data: casesData }] = useQuery<{ casesInPipeline: CaseRow[] }>({
    query: CASES_IN_PIPELINE_QUERY,
    variables: { pipelineId },
    pause: !enabled,
  });
  const [{ data: healthData }] = useQuery<{ pipelineHealth: Health[] }>({
    query: PIPELINE_HEALTH_QUERY,
    variables: { pipelineId },
    pause: !enabled,
  });

  const [openCase, setOpenCase] = useState<string | null>(null);

  if (!enabled) {
    return (
      <PageLayout maxWidth="wide">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Pipelines", href: "/pipelines" },
            { label: "Unavailable" },
          ]}
        />
        <Card padding="lg" className="text-center text-sm text-muted-foreground">
          Pipelines are not enabled for this workspace.
        </Card>
      </PageLayout>
    );
  }

  const pipeline = data?.pipeline;

  if (fetching && !pipeline) return <CenteredSpinner />;
  if (error) return <CenteredMessage>Could not load this pipeline</CenteredMessage>;
  if (!pipeline) return <CenteredMessage>Pipeline not found</CenteredMessage>;

  const stages = sortStages(pipeline.stages);
  const cases = casesData?.casesInPipeline ?? [];
  const stale = new Set((healthData?.pipelineHealth ?? []).map((h) => h.caseId));
  const activeCountsByStage = caseCountsByStage(stages, cases);
  const stats = statsData?.pipelineStats;

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Pipelines", href: "/pipelines" },
          { label: pipeline.name },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Header */}
          <Card padding="lg" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{pipeline.name}</h1>
              {!pipeline.isActive && <Badge variant="gray">inactive</Badge>}
              {pipeline.sequentialOnly && <Badge variant="blue">sequential</Badge>}
            </div>
            {pipeline.description && (
              <p className="text-sm text-muted-foreground">{pipeline.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Updated {formatTimestamp(pipeline.updatedAt)}
            </p>
          </Card>

          {/* Stages */}
          <Card padding="lg" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Stages ({stages.length})</h2>
            {stages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stages defined.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex min-w-max items-stretch gap-2">
                  {stages.map((s) => (
                    <div key={s.id} className="min-w-[9rem] rounded-lg border border-border p-2.5">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={s.requireApproval ? "red" : s.isReviewStage ? "yellow" : "gray"}
                        >
                          {s.order}
                        </Badge>
                        <span className="truncate text-sm font-medium text-foreground">
                          {s.name}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activeCountsByStage[s.id] ?? 0} active
                        {s.slaMinutes ? ` · SLA ${s.slaMinutes}m` : ""}
                        {s.requireApproval ? " · approval" : ""}
                        {s.isReviewStage ? " · review" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Cases */}
          <Card padding="lg" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Cases ({cases.length})</h2>
            {cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases in this pipeline.</p>
            ) : (
              <ul className="space-y-2">
                {cases.map((c) => {
                  const stageName = stages.find((s) => s.id === c.currentStageId)?.name ?? "—";
                  return (
                    <li key={c.id} className="rounded-lg border border-border p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant={caseStatusVariant(c.status)}>{c.status}</Badge>
                          <span className="text-foreground">{c.title}</span>
                          <span className="text-xs text-muted-foreground">@ {stageName}</span>
                          {stale.has(c.id) && <Badge variant="red">SLA breached</Badge>}
                          {c.linkedTaskId && (
                            <Link
                              href={`/task/${c.linkedTaskId}`}
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              task
                            </Link>
                          )}
                        </span>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setOpenCase((o) => (o === c.id ? null : c.id))}
                        >
                          {openCase === c.id ? "Hide history" : "History"}
                        </button>
                      </div>
                      {openCase === c.id && <CaseTimeline caseId={c.id} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* Sidebar: stats + health */}
        <div className="space-y-4">
          <Card padding="lg" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Metrics</h2>
            {stats ? (
              <dl className="grid grid-cols-2 gap-2">
                <Stat label="Active" value={stats.activeCount} />
                <Stat label="Done" value={stats.doneCount} />
                <Stat label="Rejected" value={stats.rejectedCount} />
                <Stat label="SLA breached" value={stats.staleCount} />
                <Stat label="Done (24h)" value={stats.completedLast24h} />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No metrics yet.</p>
            )}
          </Card>

          <Card padding="lg" className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Health ({(healthData?.pipelineHealth ?? []).length})
            </h2>
            {(healthData?.pipelineHealth ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No SLA breaches.</p>
            ) : (
              <ul className="space-y-2">
                {(healthData?.pipelineHealth ?? []).map((h) => (
                  <li key={h.caseId} className="text-xs">
                    <span className="text-foreground">{h.title}</span>
                    <span className="ml-1 text-destructive">
                      {h.minutesInStage}m / {h.slaMinutes}m
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}

interface CaseEvent {
  id: string;
  type: string;
  note: string | null;
  createdAt: string;
}

function CaseTimeline({ caseId }: { caseId: string }) {
  const [{ data, fetching }] = useQuery<{ pipelineCaseEvents: CaseEvent[] }>({
    query: PIPELINE_CASE_EVENTS_QUERY,
    variables: { caseId },
  });
  const events = data?.pipelineCaseEvents ?? [];
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-dashed border-border p-2.5">
      {fetching && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!fetching && events.length === 0 && (
        <p className="text-xs text-muted-foreground">No events yet.</p>
      )}
      {events.map((e) => (
        <div key={e.id} className="flex items-start gap-2 text-xs">
          <Badge variant={e.type === "commented" ? "blue" : "gray"}>{e.type}</Badge>
          <span className="flex-1">
            {e.note && <span className="text-foreground">{e.note} </span>}
            <span className="text-muted-foreground">{formatTimestamp(e.createdAt)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
