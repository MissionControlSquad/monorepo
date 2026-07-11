"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import {
  PENDING_DECOMPOSITIONS_QUERY,
  TASK_TREE_HOLDS_QUERY,
  TASK_RECOVERY_ACTIONS_QUERY,
} from "@/lib/graphql/queries";
import {
  REVIEW_DECOMPOSITION,
  APPLY_DECOMPOSITION,
  RELEASE_SUBTREE_HOLD,
  EVALUATE_WATCHDOGS_NOW,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #8: task reliability. TASK_AUTONOMY-gated + buildbase role (admin reviews decompositions,
// releases holds, runs the watchdog sweep). Agents check out tasks via REST, not here.

interface Decomposition {
  id: string;
  parentTaskId: string;
  status: string;
  plan: { title: string; description: string }[];
}
interface Hold {
  id: string;
  rootTaskId: string;
  reason: string;
}
interface Recovery {
  id: string;
  taskId: string;
  reason: string;
  status: string;
  resolution: string | null;
  createdAt: string;
}

export default function ReliabilityPage() {
  const [{ data: decData }, refetchDec] = useQuery<{ pendingDecompositions: Decomposition[] }>({
    query: PENDING_DECOMPOSITIONS_QUERY,
  });
  const [{ data: holdData }, refetchHolds] = useQuery<{ taskTreeHolds: Hold[] }>({
    query: TASK_TREE_HOLDS_QUERY,
  });
  const [{ data: recData }, refetchRec] = useQuery<{ taskRecoveryActions: Recovery[] }>({
    query: TASK_RECOVERY_ACTIONS_QUERY,
    variables: { limit: 25 },
  });

  const [, review] = useMutation(REVIEW_DECOMPOSITION);
  const [, apply] = useMutation(APPLY_DECOMPOSITION);
  const [, releaseHold] = useMutation(RELEASE_SUBTREE_HOLD);
  const [, sweep] = useMutation(EVALUATE_WATCHDOGS_NOW);

  const [busy, setBusy] = useState<string | null>(null);
  const decompositions = decData?.pendingDecompositions ?? [];
  const holds = holdData?.taskTreeHolds ?? [];
  const recoveries = recData?.taskRecoveryActions ?? [];

  function refresh() {
    refetchDec({ requestPolicy: "network-only" });
    refetchHolds({ requestPolicy: "network-only" });
    refetchRec({ requestPolicy: "network-only" });
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
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Reliability</h1>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy === "sweep"}
          onClick={() => act(() => sweep({}), "sweep")}
        >
          Run watchdog sweep
        </Button>
      </div>

      {/* Decomposition review gate */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Plan decompositions</h2>
        {decompositions.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nothing to review.</Card>
        )}
        {decompositions.map((d) => (
          <Card key={d.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Badge variant={d.status === "approved" ? "green" : "yellow"}>{d.status}</Badge>
                <span className="text-sm text-muted-foreground">
                  parent {d.parentTaskId.slice(0, 8)} · {d.plan.length} subtasks
                </span>
              </span>
              <div className="flex gap-2">
                {d.status === "proposed" && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy === d.id}
                      onClick={() => act(() => review({ id: d.id, decision: "approve" }), d.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === d.id}
                      onClick={() => act(() => review({ id: d.id, decision: "reject" }), d.id)}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {d.status === "approved" && (
                  <Button
                    size="sm"
                    disabled={busy === d.id}
                    onClick={() => act(() => apply({ id: d.id }), d.id)}
                  >
                    Apply → create tasks
                  </Button>
                )}
              </div>
            </div>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {d.plan.map((p, i) => (
                <li key={i}>{p.title}</li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      {/* Active subtree holds */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Active subtree holds</h2>
        {holds.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No active holds.</Card>
        )}
        {holds.map((h) => (
          <Card key={h.id} className="flex items-center justify-between gap-4 p-3">
            <span className="text-sm">
              <Badge variant="orange">held</Badge> {h.rootTaskId.slice(0, 8)} — {h.reason}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === h.id}
              onClick={() => act(() => releaseHold({ rootTaskId: h.rootTaskId }), h.id)}
            >
              Release
            </Button>
          </Card>
        ))}
      </section>

      {/* Recovery history */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Recent recoveries</h2>
        {recoveries.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No recovery actions.
          </Card>
        )}
        {recoveries.map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-4 p-3 text-sm">
            <span className="flex items-center gap-2">
              <Badge
                variant={r.status === "resolved" ? "green" : r.status === "failed" ? "red" : "gray"}
              >
                {r.status}
              </Badge>
              <span className="text-foreground">{r.taskId.slice(0, 8)}</span>
              <span className="text-muted-foreground">{r.reason}</span>
            </span>
            {r.resolution && <span className="text-xs text-muted-foreground">{r.resolution}</span>}
          </Card>
        ))}
      </section>
    </div>
  );
}
