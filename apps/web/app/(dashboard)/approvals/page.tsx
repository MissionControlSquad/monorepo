"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { APPROVALS_QUERY } from "@/lib/graphql/queries";
import { APPROVE_APPROVAL, REJECT_APPROVAL } from "@/lib/graphql/mutations";
import { Button, Card } from "@/components/ui";

// Epic #3: governance approvals inbox. Gated at the API by the GOVERNANCE feature + buildbase role
// (admin decides, member views). Reads/writes are workspace-scoped server-side.
interface Approval {
  id: string;
  title: string;
  subjectType: string;
  status: string;
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
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium text-foreground">{a.title}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${statusClasses(a.status)}`}
                >
                  {a.status}
                </span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {a.subjectType}
                </span>
              </div>
              {a.reason && <p className="mt-1 text-sm text-muted-foreground">{a.reason}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                Requested by {a.requestedBy?.displayName ?? "—"}
              </p>
            </div>
            {a.status === "pending" && (
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
