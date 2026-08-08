"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { SECRET_PROPOSALS_QUERY } from "@/lib/graphql/queries";
import {
  APPROVE_SECRET_PROPOSAL,
  DENY_SECRET_PROPOSAL,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge, EmptyState, Spinner } from "@/components/ui";
import { WhenAdmin } from "@/components/auth/WhenAdmin";
import { Inbox, KeyRound } from "lucide-react";

// Human-approved secret proposals (Paperclip #9934 port). An agent (or the system) proposes a secret
// it needs; a workspace admin reviews and either APPROVES — supplying the real value, which
// materializes the live vault secret — or DENIES with a reason. SECURITY: the real value is never
// shown; `placeholderValue` is only a non-secret hint. Approve/Deny are wrapped in <WhenAdmin>; the
// server also enforces admin + the SECRET_PROPOSALS flag.

interface Proposal {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  requestedByAgentId: string | null;
  placeholderValue: string | null;
  status: string;
  decisionReason: string | null;
  createdSecretId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

const STATUS_VARIANT: Record<string, "green" | "yellow" | "red"> = {
  pending: "yellow",
  approved: "green",
  denied: "red",
};

export function SecretProposalsPanel() {
  const [{ data, fetching, error }, refetch] = useQuery<{ secretProposals: Proposal[] }>({
    query: SECRET_PROPOSALS_QUERY,
  });
  const [, approve] = useMutation(APPROVE_SECRET_PROPOSAL);
  const [, deny] = useMutation(DENY_SECRET_PROPOSAL);

  const [busy, setBusy] = useState<string | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState<Record<string, string>>({});
  const [denyForm, setDenyForm] = useState<Record<string, string>>({});
  const [openReview, setOpenReview] = useState<string | null>(null);

  const proposals = data?.secretProposals ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onApprove(p: Proposal) {
    const value = approveForm[p.id];
    if (!value) return setReviewErr("Enter the real secret value to approve");
    setBusy(p.id);
    setReviewErr(null);
    try {
      const res = await approve({ id: p.id, value });
      if (res.error) return setReviewErr(res.error.graphQLErrors[0]?.message ?? "Failed to approve");
      setApproveForm((m) => ({ ...m, [p.id]: "" }));
      setOpenReview(null);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDeny(p: Proposal) {
    const reason = denyForm[p.id]?.trim();
    if (!reason) return setReviewErr("A reason is required to deny");
    setBusy(p.id);
    setReviewErr(null);
    try {
      const res = await deny({ id: p.id, reason });
      if (res.error) return setReviewErr(res.error.graphQLErrors[0]?.message ?? "Failed to deny");
      setDenyForm((m) => ({ ...m, [p.id]: "" }));
      setOpenReview(null);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  // Error state.
  if (error) {
    return (
      <Card className="p-4">
        <p className="text-sm text-destructive" role="alert">
          Couldn&apos;t load proposals. Try again.
        </p>
      </Card>
    );
  }

  // Loading state.
  if (fetching && proposals.length === 0) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Spinner /> Loading proposals…
      </Card>
    );
  }

  // Empty state.
  if (proposals.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-6 w-6" />}
        title="No proposals"
        description="When an agent proposes a secret it needs, it will appear here for an admin to approve or deny."
      />
    );
  }

  // Success / list state.
  return (
    <div className="space-y-3">
      {reviewErr && (
        <p
          className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {reviewErr}
        </p>
      )}
      {proposals.map((p) => {
        const pending = p.status === "pending";
        const open = openReview === p.id;
        return (
          <Card key={p.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-foreground">{p.name}</span>
              <Badge variant={STATUS_VARIANT[p.status] ?? "gray"}>{p.status}</Badge>
              <Badge variant="blue">{p.scope}</Badge>
              {p.requestedByAgentId && (
                <span className="text-xs text-muted-foreground">
                  by agent {p.requestedByAgentId.slice(0, 8)}
                </span>
              )}
              {pending && (
                <span className="ml-auto">
                  <WhenAdmin
                    fallback={
                      <span className="text-xs text-muted-foreground">
                        Awaiting an admin&apos;s review
                      </span>
                    }
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setOpenReview((o) => (o === p.id ? null : p.id))}
                    >
                      Review
                    </Button>
                  </WhenAdmin>
                </span>
              )}
            </div>

            {/* Purpose — the agent's rationale, framed as untrusted input. */}
            {p.description && (
              <div className="rounded border border-dashed border-border p-2">
                <p className="text-xs font-medium text-muted-foreground">Reason given by the agent</p>
                <p className="text-sm text-foreground">{p.description}</p>
              </div>
            )}
            {p.placeholderValue && (
              <p className="text-xs text-muted-foreground">
                Suggested format: <code className="rounded bg-muted px-1">{p.placeholderValue}</code>
              </p>
            )}

            {/* Decided proposals show the outcome. */}
            {!pending && p.status === "denied" && p.decisionReason && (
              <p className="text-sm text-muted-foreground">
                Denied: <span className="text-foreground">{p.decisionReason}</span>
              </p>
            )}
            {!pending && p.status === "approved" && (
              <p className="text-sm text-success">Approved — the secret was created in the vault.</p>
            )}

            {/* Admin review: approve (enter the real value) or deny (with a reason). */}
            {pending && open && (
              <WhenAdmin>
                <div className="space-y-3 border-t border-border pt-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
                      placeholder="Real secret value"
                      type="password"
                      value={approveForm[p.id] ?? ""}
                      onChange={(e) =>
                        setApproveForm((m) => ({ ...m, [p.id]: e.target.value }))
                      }
                    />
                    <Button
                      size="sm"
                      disabled={busy === p.id || !(approveForm[p.id] ?? "")}
                      onClick={() => onApprove(p)}
                    >
                      Approve &amp; create secret
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
                      placeholder="Reason for denial"
                      value={denyForm[p.id] ?? ""}
                      onChange={(e) => setDenyForm((m) => ({ ...m, [p.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === p.id || !(denyForm[p.id] ?? "").trim()}
                      onClick={() => onDeny(p)}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              </WhenAdmin>
            )}
          </Card>
        );
      })}
    </div>
  );
}
