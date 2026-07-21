"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { APPROVALS_QUERY } from "@/lib/graphql/queries";
import { APPROVE_APPROVAL, REJECT_APPROVAL, CAST_APPROVAL_VOTE } from "@/lib/graphql/mutations";
import { Button, Card } from "@/components/ui";

// Epic #3: governance approvals inbox. Gated at the API by the GOVERNANCE feature + buildbase role
// (admin decides, member views). Reads/writes are workspace-scoped server-side.
interface Approval {
  id: string;
  title: string;
  subjectType: string;
  status: string;
  requiredApprovals: number;
  reason?: string | null;
  createdAt: string;
  requestedBy?: { id: string; displayName: string } | null;
}

function statusClasses(status: string): string {
  switch (status) {
    case "approved":
      return "bg-green-500/10 text-green-600";
    case "rejected":
      return "bg-red-500/10 text-red-600";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-amber-500/10 text-amber-600";
  }
}

export default function ApprovalsPage() {
  const [{ data, fetching, error }, refetch] = useQuery<{ approvals: Approval[] }>({
    query: APPROVALS_QUERY,
  });
  const [, approve] = useMutation(APPROVE_APPROVAL);
  const [, reject] = useMutation(REJECT_APPROVAL);
  const [, castVote] = useMutation(CAST_APPROVAL_VOTE);
  const [busyId, setBusyId] = useState<string | null>(null);

  const approvals = data?.approvals ?? [];

  async function decide(id: string, kind: "approve" | "reject") {
    setBusyId(id);
    try {
      if (kind === "approve") await approve({ id });
      else await reject({ id, decisionNote: "Changes needed" });
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusyId(null);
    }
  }

  // Domain 14 #14: quorum approvals finalize only when approve votes reach requiredApprovals, so
  // vote via castApprovalVote (a direct approve would finalize immediately, bypassing the board).
  async function vote(id: string, kind: "approve" | "reject") {
    setBusyId(id);
    try {
      const res = await castVote({ id, vote: kind });
      const r = res.data?.castApprovalVote as
        { status: string; approveVotes: number; requiredApprovals: number } | undefined;
      if (res.error) toast.error(String((res.error as Error).message).replace("[GraphQL] ", ""));
      else if (r?.status === "approved") toast.success("Quorum reached — approved");
      else if (r?.status === "rejected") toast.success("Rejected");
      else toast.success(`Vote recorded — ${r?.approveVotes ?? 0}/${r?.requiredApprovals ?? 0}`);
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Approvals</h1>

      {fetching && <p className="text-sm text-muted-foreground">Loading approvals…</p>}
      {error && <p className="text-sm text-destructive">Failed to load approvals.</p>}
      {!fetching && !error && approvals.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nothing is waiting for approval.
        </Card>
      )}

      <div className="space-y-3">
        {approvals.map((a) => (
          <Card key={a.id} className="flex items-start justify-between gap-4 p-4">
            <Link href={`/approvals/${a.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium text-foreground hover:underline">
                  {a.title}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${statusClasses(a.status)}`}
                >
                  {a.status}
                </span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {a.subjectType}
                </span>
                {a.requiredApprovals > 1 && (
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
                    board · needs {a.requiredApprovals}
                  </span>
                )}
              </div>
              {a.reason && <p className="mt-1 text-sm text-muted-foreground">{a.reason}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                Requested by {a.requestedBy?.displayName ?? "—"}
              </p>
            </Link>
            {a.status === "pending" && a.subjectType === "budget_override" && (
              // A budget override can't be actioned with a plain approve — resuming needs a new
              // limit. Send the admin to Finance where Raise & resume lives.
              <Link href="/finance" className="shrink-0">
                <Button size="sm" variant="secondary">
                  Manage in Finance
                </Button>
              </Link>
            )}
            {a.status === "pending" &&
              a.subjectType !== "budget_override" &&
              a.requiredApprovals > 1 && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === a.id}
                    onClick={() => vote(a.id, "approve")}
                  >
                    Vote approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === a.id}
                    onClick={() => vote(a.id, "reject")}
                  >
                    Vote reject
                  </Button>
                </div>
              )}
            {a.status === "pending" &&
              a.subjectType !== "budget_override" &&
              a.requiredApprovals <= 1 && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === a.id}
                    onClick={() => decide(a.id, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === a.id}
                    onClick={() => decide(a.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              )}
          </Card>
        ))}
      </div>
    </div>
  );
}
