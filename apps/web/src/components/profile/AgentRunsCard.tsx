"use client";

import { useQuery } from "urql";
import Link from "next/link";
import { Cpu } from "lucide-react";
import { AGENT_RUNS_QUERY } from "@/lib/graphql/queries";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { Card, Badge } from "@/components/ui";
import { TimeAgo } from "@/components/common/TimeAgo";

// Paperclip parity (AgentDetail Runs tab): an agent's recent execution history. Read-only, RUNNERS-gated,
// self-hides when off or empty. Reuses the existing agentRuns(agentId) query.
interface Run {
  id: string;
  taskId: string | null;
  kind: string;
  providerKey: string | null;
  status: string;
  exitCode: number | null;
  reviewState: string | null;
  startedAt: string;
}

const STATUS_VARIANT: Record<string, "green" | "red" | "gray" | "yellow" | "blue"> = {
  done: "green",
  failed: "red",
  timeout: "red",
  canceled: "gray",
  running: "blue",
  queued: "yellow",
};

export function AgentRunsCard({ agentId }: { agentId: string }) {
  const enabled = useFeatureFlag(FLAG_KEYS.RUNNERS);
  const [{ data }] = useQuery<{ agentRuns: Run[] }>({
    query: AGENT_RUNS_QUERY,
    variables: { agentId, limit: 15 },
    pause: !enabled,
  });

  if (!enabled) return null;
  const runs = data?.agentRuns ?? [];
  if (runs.length === 0) return null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Recent runs</h2>
        <Link
          href="/runners"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Runners →
        </Link>
      </div>
      <ul className="space-y-1.5">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-xs">
            <Badge variant={STATUS_VARIANT[r.status] ?? "gray"} size="sm">
              {r.status}
            </Badge>
            <span className="font-mono text-foreground">
              {r.kind}
              {r.providerKey ? `:${r.providerKey}` : ""}
            </span>
            {r.exitCode != null && <span className="text-muted-foreground">exit {r.exitCode}</span>}
            {r.reviewState === "needs_review" && (
              <Badge variant="yellow" size="sm">
                needs review
              </Badge>
            )}
            {r.taskId && (
              <Link href={`/task/${r.taskId}`} className="text-muted-foreground hover:underline">
                task
              </Link>
            )}
            <TimeAgo date={r.startedAt} className="ml-auto text-muted-foreground" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
