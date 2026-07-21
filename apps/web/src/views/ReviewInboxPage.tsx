"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import {
  APPROVALS_QUERY,
  PENDING_DECOMPOSITIONS_QUERY,
  BUDGET_INCIDENTS_QUERY,
  TASKS_BY_STATUS_QUERY,
} from "@/lib/graphql/queries";
import {
  APPROVE_APPROVAL,
  REJECT_APPROVAL,
  CAST_APPROVAL_VOTE,
  REVIEW_DECOMPOSITION,
  APPLY_DECOMPOSITION,
  RESOLVE_BUDGET_INCIDENT,
  REVIEW_TASK,
} from "@/lib/graphql/mutations";
import { formatCents as money, IncidentThreshold } from "@agentcenter/utils";
import { Card, Badge, Button } from "@/components/ui";

// Unified "Needs my review" inbox: aggregates the workspace-wide governance queues an agent fills —
// approvals/hires, proposed plan decompositions, and budget incidents — with the primary decision
// wired INLINE (reusing the same shared mutations the specialized pages use). Broader alerts stay on
// /attention; per-task review (work products, agent questions, run promotion) stays on the task/runners
// pages. Each section deep-links to its full surface. GOVERNANCE-gated; sections self-hide when their
// flag is off or empty.

interface Approval {
  id: string;
  title: string;
  subjectType: string;
  status: string;
  requiredApprovals: number;
  reason?: string | null;
  requestedBy?: { displayName: string } | null;
}
interface Decomposition {
  id: string;
  parentTaskId: string;
  status: string;
  plan: unknown;
  createdAt: string;
}
interface Incident {
  id: string;
  thresholdType: string;
  spendCents: number;
  limitCents: number;
  autoPaused: boolean;
  detail: string | null;
}
interface ReviewTask {
  id: string;
  title: string;
  description: string | null;
  taskNumber: number | null;
}

function SectionHeader({
  title,
  count,
  href,
  linkLabel,
}: {
  title: string;
  count: number;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </span>
      </h2>
      <Link
        href={href}
        className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
      >
        {linkLabel} <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function TasksInReviewSection() {
  const [{ data }, refetch] = useQuery<{ tasksByStatus: ReviewTask[] }>({
    query: TASKS_BY_STATUS_QUERY,
    variables: { status: "review" },
  });
  const [, reviewTask] = useMutation(REVIEW_TASK);
  const [busy, setBusy] = useState<string | null>(null);

  const tasks = data?.tasksByStatus ?? [];
  if (tasks.length === 0) return null;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function act(id: string, decision: "approve" | "request_changes") {
    setBusy(id);
    try {
      const res = await reviewTask({ taskId: id, decision });
      if (res.error) toast.error(String(res.error.message).replace("[GraphQL] ", ""));
      else {
        toast.success(decision === "approve" ? "Task approved" : "Sent back for changes");
        refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <SectionHeader
        title="Tasks awaiting review"
        count={tasks.length}
        href="/"
        linkLabel="Board"
      />
      {tasks.map((t) => (
        <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <Link href={`/task/${t.id}`} className="min-w-0 flex-1">
            <span className="text-sm font-medium text-foreground hover:underline">
              {t.taskNumber != null ? `#${t.taskNumber} ` : ""}
              {t.title}
            </span>
            {t.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.description}</p>
            )}
          </Link>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" disabled={busy === t.id} onClick={() => act(t.id, "approve")}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === t.id}
              onClick={() => act(t.id, "request_changes")}
            >
              Request changes
            </Button>
          </div>
        </Card>
      ))}
    </section>
  );
}

function ApprovalsSection() {
  const [{ data }, refetch] = useQuery<{ approvals: Approval[] }>({
    query: APPROVALS_QUERY,
    variables: { status: "pending" },
  });
  const [, approve] = useMutation(APPROVE_APPROVAL);
  const [, reject] = useMutation(REJECT_APPROVAL);
  const [, vote] = useMutation(CAST_APPROVAL_VOTE);
  const [busy, setBusy] = useState<string | null>(null);

  const approvals = data?.approvals ?? [];
  if (approvals.length === 0) return null;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function act(id: string, fn: () => Promise<{ error?: unknown }>, ok: string) {
    setBusy(id);
    try {
      const res = await fn();
      if (res.error) toast.error(String((res.error as Error).message).replace("[GraphQL] ", ""));
      else {
        toast.success(ok);
        refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <SectionHeader
        title="Approvals & hires"
        count={approvals.length}
        href="/approvals"
        linkLabel="All approvals"
      />
      {approvals.map((a) => {
        const quorum = a.requiredApprovals > 1;
        return (
          <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <Link href={`/approvals/${a.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground hover:underline">
                  {a.title}
                </span>
                <Badge variant="gray" size="sm">
                  {a.subjectType}
                </Badge>
                {quorum && (
                  <Badge variant="blue" size="sm">
                    board · needs {a.requiredApprovals}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.requestedBy?.displayName ? `Requested by ${a.requestedBy.displayName}` : ""}
                {a.reason ? ` — ${a.reason}` : ""}
              </p>
            </Link>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={busy === a.id}
                onClick={() =>
                  quorum
                    ? act(a.id, () => vote({ id: a.id, vote: "approve" }), "Vote recorded")
                    : act(a.id, () => approve({ id: a.id }), "Approved")
                }
              >
                {quorum ? "Vote approve" : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === a.id}
                onClick={() =>
                  quorum
                    ? act(a.id, () => vote({ id: a.id, vote: "reject" }), "Rejected")
                    : act(a.id, () => reject({ id: a.id, decisionNote: "Rejected" }), "Rejected")
                }
              >
                {quorum ? "Vote reject" : "Reject"}
              </Button>
            </div>
          </Card>
        );
      })}
    </section>
  );
}

function DecompositionsSection() {
  const [{ data }, refetch] = useQuery<{ pendingDecompositions: Decomposition[] }>({
    query: PENDING_DECOMPOSITIONS_QUERY,
    variables: { status: "proposed" },
  });
  const [, review] = useMutation(REVIEW_DECOMPOSITION);
  const [, apply] = useMutation(APPLY_DECOMPOSITION);
  const [busy, setBusy] = useState<string | null>(null);

  const items = data?.pendingDecompositions ?? [];
  if (items.length === 0) return null;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  // The plan payload is a JSON array (or {subtasks:[…]}) of proposed child tasks — count them for a hint.
  function stepCount(plan: unknown): number {
    if (Array.isArray(plan)) return plan.length;
    if (
      plan &&
      typeof plan === "object" &&
      Array.isArray((plan as { subtasks?: unknown[] }).subtasks)
    )
      return (plan as { subtasks: unknown[] }).subtasks.length;
    return 0;
  }

  async function onApprove(id: string) {
    setBusy(id);
    try {
      const r = await review({ id, decision: "approve" });
      if (r.error) {
        toast.error(String(r.error.message).replace("[GraphQL] ", ""));
        return;
      }
      const a = await apply({ id });
      if (a.error) toast.error(String(a.error.message).replace("[GraphQL] ", ""));
      else toast.success("Approved — subtasks created");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onReject(id: string) {
    setBusy(id);
    try {
      const r = await review({ id, decision: "reject" });
      if (r.error) toast.error(String(r.error.message).replace("[GraphQL] ", ""));
      else toast.success("Decomposition rejected");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <SectionHeader
        title="Plan decompositions"
        count={items.length}
        href="/reliability"
        linkLabel="Reliability"
      />
      {items.map((d) => {
        const steps = stepCount(d.plan);
        return (
          <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <Link href={`/task/${d.parentTaskId}`} className="min-w-0 flex-1">
              <span className="text-sm font-medium text-foreground hover:underline">
                Proposed breakdown{steps > 0 ? ` — ${steps} subtask${steps === 1 ? "" : "s"}` : ""}
              </span>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                for task {d.parentTaskId}
              </p>
            </Link>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" disabled={busy === d.id} onClick={() => onApprove(d.id)}>
                Approve &amp; apply
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === d.id}
                onClick={() => onReject(d.id)}
              >
                Reject
              </Button>
            </div>
          </Card>
        );
      })}
    </section>
  );
}

function IncidentsSection() {
  const [{ data }, refetch] = useQuery<{ budgetIncidents: Incident[] }>({
    query: BUDGET_INCIDENTS_QUERY,
    variables: { status: "open" },
  });
  const [, resolve] = useMutation(RESOLVE_BUDGET_INCIDENT);
  const [busy, setBusy] = useState<string | null>(null);

  const incidents = data?.budgetIncidents ?? [];
  if (incidents.length === 0) return null;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onResolve(id: string) {
    setBusy(id);
    try {
      const res = await resolve({ id });
      if (res.error) toast.error(String(res.error.message).replace("[GraphQL] ", ""));
      else {
        toast.success("Incident resolved");
        refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <SectionHeader
        title="Budget incidents"
        count={incidents.length}
        href="/finance"
        linkLabel="Finance"
      />
      {incidents.map((inc) => (
        <Card key={inc.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {inc.thresholdType === IncidentThreshold.HARD ? (
                <Badge variant="red">hard breach</Badge>
              ) : (
                <Badge variant="yellow">soft warning</Badge>
              )}
              {inc.autoPaused && <Badge variant="orange">agent auto-paused</Badge>}
              <span className="text-sm font-medium text-foreground">
                {money(inc.spendCents)} / {money(inc.limitCents)}
              </span>
            </div>
            {inc.detail && <p className="mt-0.5 text-xs text-muted-foreground">{inc.detail}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            {inc.autoPaused && (
              <Link href="/finance">
                <Button size="sm">Raise &amp; resume</Button>
              </Link>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === inc.id}
              onClick={() => onResolve(inc.id)}
            >
              Resolve
            </Button>
          </div>
        </Card>
      ))}
    </section>
  );
}

export function ReviewInboxPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">Needs my review</h1>
          <p className="text-sm text-muted-foreground">
            Agent work waiting on your decision — approve, apply, or resolve it here.
          </p>
        </div>
      </div>

      <TasksInReviewSection />
      <ApprovalsSection />
      <DecompositionsSection />
      <IncidentsSection />

      <Card className="p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Where else agent work needs you</p>
        <ul className="mt-2 space-y-1 text-xs">
          <li>
            <Link href="/attention" className="text-foreground hover:underline">
              Attention
            </Link>{" "}
            — blocked tasks, org-chain breaks and other ranked alerts.
          </li>
          <li>
            <Link href="/runners" className="text-foreground hover:underline">
              Runners
            </Link>{" "}
            — promote agent runs held in low-trust review.
          </li>
          <li>
            Open a task to review its <span className="text-foreground">work products</span> and
            answer <span className="text-foreground">agent questions</span> in context.
          </li>
        </ul>
      </Card>
    </div>
  );
}
