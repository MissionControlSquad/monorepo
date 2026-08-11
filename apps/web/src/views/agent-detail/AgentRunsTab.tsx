"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "urql";
import { ArrowLeft, ChevronRight, Cpu, ListX } from "lucide-react";
import {
  AGENT_RUNS_QUERY,
  AGENT_RUN_LIVE_STATUS_QUERY,
  RUN_LOG_QUERY,
} from "@/lib/graphql/queries";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { Badge, Card, EmptyState, SkeletonList } from "@/components/ui";
import { TimeAgo } from "@/components/common/TimeAgo";
import { buildAgentDetailHref, selectRunDetail } from "./agent-detail-tabs";

interface AgentRun {
  id: string;
  agentId: string | null;
  taskId: string | null;
  kind: string;
  providerKey: string | null;
  status: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  errorMessage: string | null;
  reviewState: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

const STATUS_VARIANT: Record<string, "green" | "red" | "gray" | "yellow" | "blue"> = {
  done: "green",
  failed: "red",
  timeout: "red",
  canceled: "gray",
  running: "blue",
  queued: "yellow",
};

const LIVE_STATUSES = new Set(["running", "queued"]);

/** The redacted live tail of an in-flight run, polled every 2s (mirrors RunnersPage.LiveTail). */
function LiveTail({ runId }: { runId: string }) {
  const [{ data }, refetch] = useQuery<{
    agentRunLiveStatus: { phase: string; tail: string } | null;
  }>({ query: AGENT_RUN_LIVE_STATUS_QUERY, variables: { runId } });
  useEffect(() => {
    const t = setInterval(() => refetch({ requestPolicy: "network-only" }), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  const status = data?.agentRunLiveStatus;
  if (!status) return <p className="text-xs text-muted-foreground">Waiting for output…</p>;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
        </span>
        live · {status.phase}
      </p>
      {status.tail && (
        <pre className="max-h-72 overflow-auto rounded bg-foreground/90 p-2 text-xs text-background">
          {status.tail}
        </pre>
      )}
    </div>
  );
}

/** The persisted (redacted) log tail for a finished run. Falls back to the run's captured streams. */
function PersistedLog({ run }: { run: AgentRun }) {
  const [{ data, fetching }] = useQuery<{
    runLog: { content: string; totalBytes: number; finalized: boolean } | null;
  }>({ query: RUN_LOG_QUERY, variables: { runId: run.id } });

  const log = data?.runLog;
  const content = log?.content?.trim() || run.stdout?.trim() || run.stderr?.trim() || "";

  if (fetching && !data) {
    return <SkeletonList count={2} height="h-4" />;
  }
  if (!content) {
    return <p className="text-xs text-muted-foreground">No output captured for this run.</p>;
  }
  return (
    <pre className="max-h-96 overflow-auto rounded bg-foreground/90 p-2 text-xs text-background">
      {content}
    </pre>
  );
}

function RunDetail({ agentId, run }: { agentId: string; run: AgentRun }) {
  const isLive = LIVE_STATUSES.has(run.status);
  return (
    <div className="space-y-4">
      <Link
        href={buildAgentDetailHref(agentId, "runs")}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All runs
      </Link>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[run.status] ?? "gray"} size="sm">
            {run.status}
          </Badge>
          <span className="font-mono text-sm text-foreground">
            {run.kind}
            {run.providerKey ? `:${run.providerKey}` : ""}
          </span>
          {run.exitCode != null && (
            <span className="text-xs text-muted-foreground">exit {run.exitCode}</span>
          )}
          {run.reviewState === "needs_review" && (
            <span title="Output quarantined pending board review (untrusted/low-trust source). Untrusted-source checkouts are also routed through an isolated container profile. A reviewer must promote it before the output flows into higher-trust context.">
              <Badge variant="yellow" size="sm">
                needs review
              </Badge>
            </span>
          )}
          {run.startedAt && (
            <TimeAgo date={run.startedAt} className="ml-auto text-xs text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="font-mono">run {run.id.slice(0, 8)}</span>
          {run.taskId && (
            <Link href={`/task/${run.taskId}`} className="hover:underline">
              view task
            </Link>
          )}
        </div>
        {run.errorMessage && (
          <p className="rounded border border-destructive/30 bg-destructive-muted px-3 py-2 text-xs text-destructive">
            {run.errorMessage}
          </p>
        )}
      </Card>

      <Card className="space-y-2 p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {isLive ? "Live transcript" : "Transcript"}
        </h3>
        {isLive ? <LiveTail runId={run.id} /> : <PersistedLog run={run} />}
      </Card>
    </div>
  );
}

export function AgentRunsTab({ agentId, runId }: { agentId: string; runId: string | null }) {
  const runnersEnabled = useFeatureFlag(FLAG_KEYS.RUNNERS);
  const [result] = useQuery<{ agentRuns: AgentRun[] }>({
    query: AGENT_RUNS_QUERY,
    variables: { agentId, limit: 30 },
    pause: !agentId || !runnersEnabled,
  });

  const { data, fetching, error } = result;
  const runs = data?.agentRuns ?? [];
  const selection = selectRunDetail(runId, runs);

  if (!runnersEnabled) {
    return (
      <EmptyState
        icon={<Cpu className="h-6 w-6 text-muted-foreground" />}
        title="Runs are not enabled"
        description="Enable the Runners feature to record and review this agent's executions."
      />
    );
  }

  if (fetching && !data) {
    return (
      <Card className="p-5">
        <SkeletonList count={6} height="h-10" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <ListX className="h-6 w-6 text-destructive" />
        <p className="text-sm font-medium text-foreground">Could not load runs</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </Card>
    );
  }

  // Run-detail deep-link (?tab=runs&run=<id>).
  if (selection.mode === "detail") {
    if (selection.run) return <RunDetail agentId={agentId} run={selection.run} />;
    return (
      <div className="space-y-4">
        <Link
          href={buildAgentDetailHref(agentId, "runs")}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All runs
        </Link>
        <EmptyState
          icon={<ListX className="h-6 w-6 text-muted-foreground" />}
          title="Run not found"
          description="This run is not in the recent history for this agent. It may have been pruned."
        />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={<Cpu className="h-6 w-6 text-muted-foreground" />}
        title="No runs yet"
        description="This agent has not executed any runs. Runs appear here once it starts working."
      />
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Cpu className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Recent runs</h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {runs.length} {runs.length === 1 ? "run" : "runs"}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {runs.map((run) => (
          <li key={run.id}>
            <Link
              href={buildAgentDetailHref(agentId, "runs", run.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs transition hover:bg-muted/40"
            >
              <Badge variant={STATUS_VARIANT[run.status] ?? "gray"} size="sm">
                {run.status}
              </Badge>
              <span className="font-mono text-foreground">
                {run.kind}
                {run.providerKey ? `:${run.providerKey}` : ""}
              </span>
              {run.exitCode != null && (
                <span className="text-muted-foreground">exit {run.exitCode}</span>
              )}
              {run.reviewState === "needs_review" && (
                <Badge variant="yellow" size="sm">
                  needs review
                </Badge>
              )}
              {run.startedAt && (
                <TimeAgo date={run.startedAt} className="ml-auto text-muted-foreground" />
              )}
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
