"use client";

import { Gauge } from "lucide-react";
import { Breadcrumbs, Card, EmptyState, PageLayout } from "@/components/ui";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { UsageOverview } from "@/components/usage/UsageOverview";

/**
 * Account "Usage & limits" surface (Epic #1) — renders the workspace's HUMAN plan quotas
 * (consumed / included / available / overage) and recent usage activity. This is the customer's
 * plan quota ("your plan allows N agents / projects"), distinct from the AI-agent LLM/run budgets
 * governed by finance.prisma, which are surfaced elsewhere.
 *
 * Degrades gracefully: when buildbase is not configured (provider dormant), shows a clear empty
 * state rather than crashing. When configured, delegates loading/error/empty/loaded to UsageOverview.
 */
export function UsagePage() {
  const ready = useBuildbaseReady();

  return (
    <PageLayout maxWidth="medium">
      <Breadcrumbs
        items={[{ label: "Settings", href: "/settings" }, { label: "Usage & limits" }]}
      />

      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Gauge className="size-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Usage &amp; limits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your workspace plan&apos;s quotas and recent activity.
          </p>
        </div>
      </div>

      {ready ? (
        <UsageOverview />
      ) : (
        <Card padding="none">
          <EmptyState
            icon={<Gauge />}
            title="Usage tracking isn't active yet"
            description="Usage & limits are available when your workspace is on a plan. Once billing is connected, your plan's quotas and recent activity will appear here."
          />
        </Card>
      )}
    </PageLayout>
  );
}
