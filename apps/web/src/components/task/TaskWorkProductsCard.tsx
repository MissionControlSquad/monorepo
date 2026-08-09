"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { WORK_PRODUCTS_BY_TASK_QUERY } from "@/lib/graphql/queries";
import { SET_WORK_PRODUCT_REVIEW_STATE, SET_WORK_PRODUCT_STATUS } from "@/lib/graphql/mutations";
import { WORK_PRODUCT_STATUSES } from "@agentcenter/utils";
import { Badge, Button } from "@/components/ui";

// Domain 8 G1: work products = the code-output subset of a task's deliverables (PRs, branches,
// preview URLs, runtime services) with a review lifecycle. Complements the general Deliverables list
// on the task by surfacing the review governance (reviewState / outputStatus) + admin actions.
// Keyed by taskId; renders nothing when the task has no work products. WORK_PRODUCTS-gated server-side.
interface WorkProduct {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  provider: string | null;
  reviewState: string;
  outputStatus: string;
  healthStatus: string | null;
  isPrimary: boolean;
  createdAt: string;
}

type BadgeVariant = "gray" | "yellow" | "green" | "red" | "orange";
const REVIEW_VARIANT: Record<string, BadgeVariant> = {
  needs_review: "yellow",
  approved: "green",
  changes_requested: "orange",
  none: "gray",
};

export function TaskWorkProductsCard({ taskId }: { taskId: string }) {
  const [{ data }, refetch] = useQuery<{ workProductsByTask: WorkProduct[] }>({
    query: WORK_PRODUCTS_BY_TASK_QUERY,
    variables: { taskId },
  });
  const [, setReviewState] = useMutation(SET_WORK_PRODUCT_REVIEW_STATE);
  const [, setStatus] = useMutation(SET_WORK_PRODUCT_STATUS);
  const [busy, setBusy] = useState<string | null>(null);

  const products = data?.workProductsByTask ?? [];
  if (products.length === 0) return null;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function review(id: string, reviewState: "approved" | "changes_requested") {
    setBusy(id);
    try {
      const res = await setReviewState({ deliverableId: id, reviewState });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed");
      else {
        toast.success(reviewState === "approved" ? "Approved" : "Changes requested");
        refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(id: string, status: string) {
    setBusy(id);
    try {
      const res = await setStatus({ deliverableId: id, status });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed");
      else refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">Work products ({products.length})</h3>
      <div className="space-y-2">
        {products.map((wp) => (
          <div key={wp.id} className="rounded-lg border border-border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="blue" size="sm">
                {wp.kind.replace(/_/g, " ")}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {wp.title}
              </span>
              {wp.isPrimary && (
                <Badge variant="green" size="sm">
                  primary
                </Badge>
              )}
              {wp.url && (
                <a
                  href={wp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Open work product"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant={REVIEW_VARIANT[wp.reviewState] ?? "gray"} size="sm">
                {wp.reviewState.replace(/_/g, " ")}
              </Badge>
              <select
                className="rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                value={wp.outputStatus}
                disabled={busy === wp.id}
                onChange={(e) => changeStatus(wp.id, e.target.value)}
                aria-label="Output status"
              >
                {WORK_PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {wp.reviewState === "needs_review" && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  disabled={busy === wp.id}
                  onClick={() => review(wp.id, "approved")}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === wp.id}
                  onClick={() => review(wp.id, "changes_requested")}
                >
                  Request changes
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
