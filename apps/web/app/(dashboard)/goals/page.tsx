"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { Target } from "lucide-react";
import { GOAL_STATUSES, GOAL_STATUS } from "@agentcenter/utils";
import { GOALS_QUERY, AGENTS_QUERY } from "@/lib/graphql/queries";
import { UPDATE_GOAL, DELETE_GOAL } from "@/lib/graphql/mutations";
import { Button, Card, Badge, ConfirmDialog, EmptyState, Select } from "@/components/ui";
import { GoalDialog } from "@/components/dialogs/GoalDialog";
import { useConfirmDelete } from "@/hooks/useCrud";

// Epic #11: goals / OKRs. GOALS-gated. Hierarchical (company → team → task); each goal optionally
// owned by an agent. Renders the tree indented by depth with inline status / owner quick-edits.

interface Goal {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  parentId: string | null;
  ownerAgentId: string | null;
  createdAt: string;
}
interface AgentLite {
  id: string;
  name: string;
}

const STATUSES = GOAL_STATUSES;
const STATUS_VARIANT: Record<string, "gray" | "blue" | "green" | "purple"> = {
  [GOAL_STATUS.PLANNED]: "gray",
  [GOAL_STATUS.ACTIVE]: "blue",
  [GOAL_STATUS.COMPLETED]: "green",
  [GOAL_STATUS.ARCHIVED]: "purple",
};

export default function GoalsPage() {
  const [{ data }, refetch] = useQuery<{ goals: Goal[] }>({ query: GOALS_QUERY });
  const [{ data: agentsData }] = useQuery<{ agents: AgentLite[] }>({ query: AGENTS_QUERY });
  const [, updateGoal] = useMutation(UPDATE_GOAL);
  const [, deleteGoal] = useMutation(DELETE_GOAL);

  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const goals = data?.goals ?? [];
  const agents = agentsData?.agents ?? [];
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? null;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  const del = useConfirmDelete<Goal>({
    onDelete: async (g) => {
      const r = await deleteGoal({ id: g.id });
      return r.error?.message ?? null;
    },
    onDone: refresh,
  });

  // Build parent → children adjacency, then a depth-first ordering for indentation.
  const ordered = useMemo(() => {
    const byParent = new Map<string | null, Goal[]>();
    for (const g of goals) {
      const k = g.parentId ?? null;
      byParent.set(k, [...(byParent.get(k) ?? []), g]);
    }
    const out: { goal: Goal; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const g of byParent.get(parentId) ?? []) {
        out.push({ goal: g, depth });
        walk(g.id, depth + 1);
      }
    };
    walk(null, 0);
    if (out.length < goals.length) {
      const seen = new Set(out.map((o) => o.goal.id));
      for (const g of goals) if (!seen.has(g.id)) out.push({ goal: g, depth: 0 });
    }
    return out;
  }, [goals]);

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
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Hierarchical goals (company → team → task), each optionally owned by an agent.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>New goal</Button>
      </div>

      <GoalDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

      {ordered.length === 0 ? (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title="No goals yet"
          description="Create a goal to start tracking outcomes."
        />
      ) : (
        <div className="space-y-2">
          {ordered.map(({ goal, depth }) => (
            <Card
              key={goal.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
              style={{ marginLeft: depth * 20 }}
            >
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="gray">{goal.level}</Badge>
                <Link
                  href={`/goals/${goal.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {goal.title}
                </Link>
                {agentName(goal.ownerAgentId) && (
                  <span className="text-xs text-muted-foreground">
                    @ {agentName(goal.ownerAgentId)}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[goal.status] ?? "gray"}>{goal.status}</Badge>
                <Select size="sm" className="text-xs" value={goal.status}
                  disabled={busy === goal.id}
                  onChange={(e) => act(() => updateGoal({ id: goal.id, status: e.target.value }), goal.id)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
                <Select size="sm" className="text-xs" value={goal.ownerAgentId ?? ""}
                  disabled={busy === goal.id}
                  onChange={(e) =>
                    act(
                      () =>
                        e.target.value
                          ? updateGoal({ id: goal.id, ownerAgentId: e.target.value })
                          : updateGoal({ id: goal.id, clearOwner: true }),
                      goal.id,
                    )
                  }
                >
                  <option value="">no owner</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
                <Button size="sm" variant="secondary" onClick={() => del.ask(goal)}>
                  Delete
                </Button>
              </span>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={del.isOpen}
        onClose={del.cancel}
        onConfirm={del.confirm}
        title="Delete goal?"
        description={`"${del.target?.title}" and its position in the tree will be removed. This can't be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
