"use client";

import { useQuery } from "urql";
import { COST_BY_TASK_TREE_QUERY } from "@/lib/graphql/queries";
import { formatCents as money } from "@agentcenter/utils";

// Domain 12 GAP-6 A12: recursive cost + runtime rollup over a task's subtree. Read-only; keyed by
// rootTaskId. Renders nothing when the subtree has no recorded cost or runs.
interface Rollup {
  rootTaskId: string;
  taskCount: number;
  costCents: number;
  eventCount: number;
  runCount: number;
  runtimeSeconds: number;
}

function duration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function TaskCostRollupCard({ taskId }: { taskId: string }) {
  const [{ data }] = useQuery<{ costByTaskTree: Rollup }>({
    query: COST_BY_TASK_TREE_QUERY,
    variables: { rootTaskId: taskId },
  });
  const r = data?.costByTaskTree;
  if (!r || (r.costCents === 0 && r.runCount === 0)) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">Cost rollup (subtree)</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Cost</span>
          <p className="font-medium text-foreground">{money(r.costCents)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Runtime</span>
          <p className="font-medium text-foreground">{duration(r.runtimeSeconds)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Tasks</span>
          <p className="font-medium text-foreground">{r.taskCount}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Runs</span>
          <p className="font-medium text-foreground">{r.runCount}</p>
        </div>
      </div>
    </div>
  );
}
