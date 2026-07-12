"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { GOALS_QUERY, AGENTS_QUERY } from "@/lib/graphql/queries";
import { CREATE_GOAL, UPDATE_GOAL, DELETE_GOAL } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #11: goals / OKRs. GOALS-gated. Hierarchical (company → team → task); each goal optionally
// owned by an agent. Renders the tree indented by depth with inline status / owner / delete.

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

const LEVELS = ["company", "team", "task"] as const;
const STATUSES = ["planned", "active", "completed", "archived"] as const;
const STATUS_VARIANT: Record<string, "gray" | "blue" | "green" | "purple"> = {
  planned: "gray",
  active: "blue",
  completed: "green",
  archived: "purple",
};

export default function GoalsPage() {
  const [{ data }, refetch] = useQuery<{ goals: Goal[] }>({ query: GOALS_QUERY });
  const [{ data: agentsData }] = useQuery<{ agents: AgentLite[] }>({ query: AGENTS_QUERY });
  const [, createGoal] = useMutation(CREATE_GOAL);
  const [, updateGoal] = useMutation(UPDATE_GOAL);
  const [, deleteGoal] = useMutation(DELETE_GOAL);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", level: "task", parentId: "" });
  const goals = data?.goals ?? [];
  const agents = agentsData?.agents ?? [];
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? null;
  const refresh = () => refetch({ requestPolicy: "network-only" });

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
    // Orphans whose parent isn't visible (shouldn't happen) fall back to root.
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
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Goals</h1>
        <p className="text-sm text-muted-foreground">
          Hierarchical goals (company → team → task), each optionally owned by an agent.
        </p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <input
          className="min-w-[12rem] flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="New goal title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <select
          className="rounded border border-border bg-background px-2 py-1 text-sm"
          value={form.level}
          onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-border bg-background px-2 py-1 text-sm"
          value={form.parentId}
          onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
        >
          <option value="">no parent</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              under: {g.title}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!form.title.trim() || busy === "create"}
          onClick={() =>
            act(async () => {
              await createGoal({
                title: form.title.trim(),
                level: form.level,
                parentId: form.parentId || undefined,
              });
              setForm({ title: "", level: "task", parentId: "" });
            }, "create")
          }
        >
          Add goal
        </Button>
      </Card>

      {ordered.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No goals yet.</Card>
      )}

      <div className="space-y-2">
        {ordered.map(({ goal, depth }) => (
          <Card
            key={goal.id}
            className="flex flex-wrap items-center justify-between gap-2 p-3"
            style={{ marginLeft: depth * 20 }}
          >
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="gray">{goal.level}</Badge>
              <span className="font-medium text-foreground">{goal.title}</span>
              {agentName(goal.ownerAgentId) && (
                <span className="text-xs text-muted-foreground">
                  @ {agentName(goal.ownerAgentId)}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[goal.status] ?? "gray"}>{goal.status}</Badge>
              <select
                className="rounded border border-border bg-background px-2 py-1 text-xs"
                value={goal.status}
                disabled={busy === goal.id}
                onChange={(e) =>
                  act(() => updateGoal({ id: goal.id, status: e.target.value }), goal.id)
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-border bg-background px-2 py-1 text-xs"
                value={goal.ownerAgentId ?? ""}
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
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === goal.id}
                onClick={() => act(() => deleteGoal({ id: goal.id }), goal.id)}
              >
                Delete
              </Button>
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
