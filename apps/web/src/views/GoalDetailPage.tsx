"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Loader2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { GOAL_QUERY, GOALS_QUERY, AGENTS_QUERY } from "@/lib/graphql/queries";
import { CREATE_GOAL, UPDATE_GOAL, DELETE_GOAL } from "@/lib/graphql/mutations";
import { Breadcrumbs, Button, Card, Badge, PageLayout, Textarea } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { GOAL_LEVELS, GOAL_STATUSES, GOAL_STATUS } from "@agentcenter/utils";

// Epic #11: goal detail — inline title/description edit, a properties panel (status/level/owner/
// parent), a sub-goals tab with quick-add + navigation, and the linked-tasks list (Epic #11b).

interface GoalLite {
  id: string;
  title: string;
  level: string;
  status: string;
}
interface Goal extends GoalLite {
  description: string | null;
  parentId: string | null;
  ownerAgentId: string | null;
  ownerAgent?: { id: string; name: string } | null;
  parent?: { id: string; title: string; level: string } | null;
  children: GoalLite[];
  tasks: { id: string; title: string; taskNumber: number; status: string }[];
}

const STATUS_VARIANT: Record<string, "gray" | "blue" | "green" | "yellow"> = {
  [GOAL_STATUS.PLANNED]: "gray",
  [GOAL_STATUS.ACTIVE]: "blue",
  [GOAL_STATUS.COMPLETED]: "green",
  [GOAL_STATUS.ARCHIVED]: "yellow",
};

export function GoalDetailPage({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [{ data, fetching }, refetch] = useQuery<{ goal: Goal | null }>({
    query: GOAL_QUERY,
    variables: { id: goalId },
  });
  const [{ data: goalsData }] = useQuery<{ goals: GoalLite[] }>({ query: GOALS_QUERY });
  const [{ data: agentsData }] = useQuery<{ agents: { id: string; name: string }[] }>({
    query: AGENTS_QUERY,
  });
  const [, updateGoal] = useMutation(UPDATE_GOAL);
  const [, createGoal] = useMutation(CREATE_GOAL);
  const [, deleteGoal] = useMutation(DELETE_GOAL);

  const goal = data?.goal;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
    }
  }, [goal]);

  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);
  const parentOptions = useMemo(
    () => (goalsData?.goals ?? []).filter((g) => g.id !== goalId),
    [goalsData, goalId],
  );
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function patch(vars: Record<string, unknown>, ok = "Goal updated") {
    setBusy(true);
    try {
      const res = await updateGoal({ id: goalId, ...vars });
      if (res.error) {
        toast.error(res.error.message.replace("[GraphQL] ", ""));
        return;
      }
      toast.success(ok);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addSubGoal() {
    if (!subTitle.trim()) return;
    setBusy(true);
    try {
      const res = await createGoal({ title: subTitle.trim(), parentId: goalId, level: "task" });
      if (res.error) {
        toast.error("Failed to add sub-goal");
        return;
      }
      setSubTitle("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this goal? Sub-goals are re-rooted, not deleted.")) return;
    const res = await deleteGoal({ id: goalId });
    if (res.error) {
      toast.error("Failed to delete goal");
      return;
    }
    toast.success("Goal deleted");
    router.push("/goals");
  }

  if (fetching && !goal) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!goal) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Goal not found</p>
      </div>
    );
  }

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Goals", href: "/goals" },
          ...(goal.parent ? [{ label: goal.parent.title, href: `/goals/${goal.parent.id}` }] : []),
          { label: goal.title },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          <Card padding="lg" className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[goal.status] ?? "gray"}>{goal.status}</Badge>
              <Badge variant="gray">{goal.level}</Badge>
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== goal.title && patch({ title: title.trim() })}
              className="text-lg font-semibold"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (goal.description ?? "") && patch({ description })}
              rows={4}
              placeholder="Describe this goal…"
              className="resize-y rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Card>

          {/* Sub-goals */}
          <Card padding="lg" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Sub-goals ({goal.children.length})
            </h2>
            {goal.children.length > 0 && (
              <ul className="space-y-2">
                {goal.children.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/goals/${c.id}`}
                      className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm hover:bg-muted"
                    >
                      <span className="truncate text-foreground">{c.title}</span>
                      <span className="flex items-center gap-1.5">
                        <Badge variant="gray" size="sm">
                          {c.level}
                        </Badge>
                        <Badge variant={STATUS_VARIANT[c.status] ?? "gray"} size="sm">
                          {c.status}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                placeholder="New sub-goal title…"
                onKeyDown={(e) => e.key === "Enter" && addSubGoal()}
              />
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                disabled={busy}
                onClick={addSubGoal}
              >
                Add
              </Button>
            </div>
          </Card>

          {/* Linked tasks */}
          <Card padding="lg" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Linked tasks ({goal.tasks.length})
            </h2>
            {goal.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks are attributed to this goal.</p>
            ) : (
              <ul className="space-y-2">
                {goal.tasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/task/${t.id}`}
                      className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm hover:bg-muted"
                    >
                      <span className="truncate text-foreground">
                        #{t.taskNumber} {t.title}
                      </span>
                      <Badge variant="gray" size="sm">
                        {t.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Properties panel */}
        <Card padding="lg" className="h-fit space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Properties</h2>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <Select value={goal.status} onValueChange={(v) => patch({ status: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Level</span>
            <Select value={goal.level} onValueChange={(v) => patch({ level: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOAL_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Owner agent</span>
            <Select
              value={goal.ownerAgentId ?? "none"}
              onValueChange={(v) =>
                v === "none" ? patch({ clearOwner: true }) : patch({ ownerAgentId: v })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Parent goal</span>
            <Select
              value={goal.parentId ?? "none"}
              onValueChange={(v) =>
                v === "none" ? patch({ clearParent: true }) : patch({ parentId: v })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None (root)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (root)</SelectItem>
                {parentOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="border-t border-border pt-3">
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={remove}
              className="w-full"
            >
              Delete goal
            </Button>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
