"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { ATTENTION_SEVERITY, ATTENTION_SOURCE_KIND } from "@agentcenter/utils";
import { ATTENTION_FEED_QUERY } from "@/lib/graphql/queries";
import { DISMISS_ATTENTION_ITEM } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #20: unified attention feed. ATTENTION-gated. Ranked "what needs you now" over approvals,
// budget incidents, blocked tasks, and broken org chains — each deep-links to its owning screen.

interface Item {
  id: string;
  sourceKind: string;
  severity: string;
  subjectKind: string;
  subjectId: string;
  title: string;
  whyNow: string;
  activityAt: string;
}
interface Feed {
  totalCount: number;
  countsBySourceKind: Record<string, number>;
  items: Item[];
}

const SEVERITY_VARIANT: Record<string, "red" | "orange" | "yellow" | "gray"> = {
  [ATTENTION_SEVERITY.CRITICAL]: "red",
  [ATTENTION_SEVERITY.HIGH]: "orange",
  [ATTENTION_SEVERITY.MEDIUM]: "yellow",
  [ATTENTION_SEVERITY.LOW]: "gray",
};
const SOURCE_LABEL: Record<string, string> = {
  [ATTENTION_SOURCE_KIND.APPROVAL]: "Approval",
  [ATTENTION_SOURCE_KIND.BUDGET_ALERT]: "Budget",
  [ATTENTION_SOURCE_KIND.BLOCKER_ATTENTION]: "Blocked task",
  [ATTENTION_SOURCE_KIND.AGENT_ERROR_ALERT]: "Org chain",
};
// Where each source resolves.
const SOURCE_HREF: Record<string, string> = {
  [ATTENTION_SOURCE_KIND.APPROVAL]: "/approvals",
  [ATTENTION_SOURCE_KIND.BUDGET_ALERT]: "/finance",
  [ATTENTION_SOURCE_KIND.BLOCKER_ATTENTION]: "/reliability",
  [ATTENTION_SOURCE_KIND.AGENT_ERROR_ALERT]: "/org-chart",
};

export default function AttentionPage() {
  const [{ data, fetching }, refetch] = useQuery<{ attentionFeed: Feed }>({
    query: ATTENTION_FEED_QUERY,
  });
  const [, dismiss] = useMutation(DISMISS_ATTENTION_ITEM);
  const [busy, setBusy] = useState<string | null>(null);
  const feed = data?.attentionFeed;

  async function onDismiss(itemKey: string, snoozeHours?: number) {
    setBusy(itemKey);
    try {
      await dismiss({ itemKey, snoozeHours: snoozeHours ?? null });
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Attention</h1>
          <p className="text-sm text-muted-foreground">
            What needs you now, ranked by urgency across your workspace.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={fetching}
          onClick={() => refetch({ requestPolicy: "network-only" })}
        >
          Refresh
        </Button>
      </div>

      {feed && feed.totalCount === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          All clear — nothing needs your attention. 🎉
        </Card>
      )}

      {feed?.items.map((item) => (
        <Card key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={SEVERITY_VARIANT[item.severity] ?? "gray"}>{item.severity}</Badge>
              <Badge variant="gray">{SOURCE_LABEL[item.sourceKind] ?? item.sourceKind}</Badge>
              <span className="font-medium text-foreground">{item.title}</span>
            </span>
            <span className="text-xs text-muted-foreground">{item.whyNow}</span>
          </span>
          <span className="flex gap-2">
            <Link href={SOURCE_HREF[item.sourceKind] ?? "/"}>
              <Button size="sm" variant="secondary">
                Resolve
              </Button>
            </Link>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === item.id}
              onClick={() => onDismiss(item.id, 24)}
              title="Hide for a day; it'll come back if still relevant"
            >
              Snooze 1d
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === item.id}
              onClick={() => onDismiss(item.id)}
            >
              Dismiss
            </Button>
          </span>
        </Card>
      ))}
    </div>
  );
}
