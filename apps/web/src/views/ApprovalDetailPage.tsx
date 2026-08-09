"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Loader2, AlertCircle, MessageSquare } from "lucide-react";
import { APPROVAL_QUERY } from "@/lib/graphql/queries";
import {
  APPROVE_APPROVAL,
  REJECT_APPROVAL,
  REQUEST_APPROVAL_CHANGES,
  RESUBMIT_APPROVAL,
  CANCEL_APPROVAL,
  ADD_APPROVAL_COMMENT,
  CAST_APPROVAL_VOTE,
} from "@/lib/graphql/mutations";
import { Breadcrumbs, Button, Card, Badge, PageLayout } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";
import { ApprovalStatus } from "@agentcenter/utils";

type BadgeVariant = "gray" | "yellow" | "green" | "red" | "orange";

// Epic #3: approval detail — payload, decision note, reviewer/requester identity, the comment thread,
// and every decision action including "request changes" (the transition into needs_changes). Decision
// actions are enforced admin-only server-side (same as the list page).

interface Person {
  id: string;
  displayName: string;
}
interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author?: Person | null;
}
interface Approval {
  id: string;
  title: string;
  subjectType: string;
  subjectId: string;
  taskId: string | null;
  status: string;
  requiredApprovals: number;
  reason: string | null;
  decisionNote: string | null;
  resubmitCount: number;
  createdAt: string;
  decidedAt: string | null;
  requestedBy?: Person | null;
  decidedBy?: Person | null;
  task?: { id: string; title: string; taskNumber: number; status: string } | null;
  comments: Comment[];
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  [ApprovalStatus.PENDING]: "yellow",
  [ApprovalStatus.APPROVED]: "green",
  [ApprovalStatus.REJECTED]: "red",
  [ApprovalStatus.NEEDS_CHANGES]: "orange",
  [ApprovalStatus.CANCELLED]: "gray",
};

export function ApprovalDetailPage({ approvalId }: { approvalId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ approval: Approval | null }>({
    query: APPROVAL_QUERY,
    variables: { id: approvalId },
  });
  const [, approve] = useMutation(APPROVE_APPROVAL);
  const [, reject] = useMutation(REJECT_APPROVAL);
  const [, requestChanges] = useMutation(REQUEST_APPROVAL_CHANGES);
  const [, resubmit] = useMutation(RESUBMIT_APPROVAL);
  const [, cancel] = useMutation(CANCEL_APPROVAL);
  const [, castVote] = useMutation(CAST_APPROVAL_VOTE);
  const [, addComment] = useMutation(ADD_APPROVAL_COMMENT);

  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const approval = data?.approval;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function act(fn: () => Promise<{ error?: unknown }>, ok: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.error) {
        toast.error(String((res.error as Error).message).replace("[GraphQL] ", ""));
        return;
      }
      toast.success(ok);
      setNote("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function vote(kind: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await castVote({ id: approvalId, vote: kind });
      if (res.error) {
        toast.error(String((res.error as Error).message).replace("[GraphQL] ", ""));
        return;
      }
      const r = res.data?.castApprovalVote as
        { status: string; approveVotes: number; requiredApprovals: number } | undefined;
      if (r?.status === "approved") toast.success("Quorum reached — approved");
      else if (r?.status === "rejected") toast.success("Rejected");
      else
        toast.success(
          `Vote recorded — ${r?.approveVotes ?? 0}/${r?.requiredApprovals ?? 0} approvals`,
        );
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      const res = await addComment({ approvalId, body: comment.trim() });
      if (res.error) {
        toast.error("Failed to add comment");
        return;
      }
      setComment("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (fetching && !approval) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!approval) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Approval not found</p>
      </div>
    );
  }

  const isPending = approval.status === ApprovalStatus.PENDING;
  const isQuorum = (approval.requiredApprovals ?? 1) > 1;
  const canResubmit =
    approval.status === ApprovalStatus.NEEDS_CHANGES || approval.status === ApprovalStatus.REJECTED;
  const isFinal =
    approval.status === ApprovalStatus.APPROVED || approval.status === ApprovalStatus.CANCELLED;

  return (
    <PageLayout maxWidth="medium">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Approvals", href: "/approvals" },
          { label: approval.title },
        ]}
      />

      <Card padding="lg" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{approval.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {approval.subjectType} · requested by {approval.requestedBy?.displayName ?? "—"}
              {isQuorum && ` · board vote (needs ${approval.requiredApprovals} approvals)`}
              {approval.resubmitCount > 0 && ` · resubmitted ${approval.resubmitCount}×`}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[approval.status] ?? "gray"}>
            {approval.status.replace("_", " ")}
          </Badge>
        </div>

        {approval.reason && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{approval.reason}</p>
        )}

        {approval.decisionNote && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
            <span className="font-medium">Decision note</span>
            {approval.decidedBy && ` — ${approval.decidedBy.displayName}`}: {approval.decisionNote}
          </div>
        )}

        {approval.task && (
          <Link
            href={`/task/${approval.task.id}`}
            className="block rounded-lg border border-border p-3 text-sm hover:bg-muted"
          >
            <span className="text-muted-foreground">Linked task</span> #{approval.task.taskNumber}{" "}
            {approval.task.title}{" "}
            <Badge variant="gray" size="sm">
              {approval.task.status}
            </Badge>
          </Link>
        )}

        {!isFinal && (
          <div className="space-y-2 border-t border-border pt-4">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional decision note (shown to the requester)"
            />
            <div className="flex flex-wrap gap-2">
              {isPending && isQuorum && (
                // Domain 14 #14: board quorum — each admin casts one vote; the approval only
                // finalizes once approve votes reach requiredApprovals (a single reject finalizes it).
                <>
                  <Button size="sm" disabled={busy} onClick={() => vote("approve")}>
                    Vote to approve
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => vote("reject")}>
                    Vote to reject
                  </Button>
                </>
              )}
              {isPending && !isQuorum && (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      act(() => approve({ id: approvalId, decisionNote: note || null }), "Approved")
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => requestChanges({ id: approvalId, decisionNote: note || null }),
                        "Changes requested",
                      )
                    }
                  >
                    Request changes
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      act(() => reject({ id: approvalId, decisionNote: note || null }), "Rejected")
                    }
                  >
                    Reject
                  </Button>
                </>
              )}
              {canResubmit && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => act(() => resubmit({ id: approvalId }), "Resubmitted")}
                >
                  Resubmit
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => act(() => cancel({ id: approvalId }), "Cancelled")}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Comment thread */}
      <Card padding="lg" className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4" /> Comments ({approval.comments.length})
        </h2>
        {approval.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {approval.comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-foreground">
                  {c.author?.displayName ?? "—"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 border-t border-border pt-3">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitComment();
              }
            }}
          />
          <Button size="sm" disabled={busy || !comment.trim()} onClick={submitComment}>
            Comment
          </Button>
        </div>
      </Card>
    </PageLayout>
  );
}
