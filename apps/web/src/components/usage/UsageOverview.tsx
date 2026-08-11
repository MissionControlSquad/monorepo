"use client";

import { useSaaSWorkspaces, useAllQuotaUsage, useUsageLogs } from "@buildbase/sdk/react";
import type { IQuotaUsageStatus, IUsageLogEntry } from "@buildbase/sdk/react";
import { AlertTriangle, Gauge, History, Info, RefreshCw } from "lucide-react";
import { Button, Card, Skeleton, Tooltip } from "@/components/ui";
import { metaForSlug } from "@/lib/quota-slugs";
import { quotaConsumedFraction } from "./quota-gate-logic";

/**
 * The rendered workspace HUMAN plan-quota surface (Epic #1): per-quota consumed/included/available/
 * overage bars from `useAllQuotaUsage`, plus a recent-activity list from `useUsageLogs`. Assumes the
 * buildbase provider is mounted (rendered inside a `useBuildbaseReady()` guard by UsagePage).
 *
 * Handles its own loading / error / empty / loaded states. This is the customer's plan quota — the
 * AI-agent LLM/run budgets live elsewhere (finance.prisma) and are intentionally not shown here.
 */
export function UsageOverview() {
  const { currentWorkspace } = useSaaSWorkspaces();
  const workspaceId = currentWorkspace?._id;
  const {
    quotas,
    loading: quotasLoading,
    error: quotasError,
    refetch,
  } = useAllQuotaUsage(workspaceId);
  const {
    logs,
    loading: logsLoading,
    error: logsError,
  } = useUsageLogs(workspaceId, undefined, { limit: 10 });

  // ── Loading ──────────────────────────────────────────────────────────────
  if (quotasLoading && !quotas) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <span className="sr-only">Loading usage…</span>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (quotasError) {
    return (
      <Card padding="lg" className="space-y-3">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Couldn&apos;t load usage</p>
            <p className="text-muted-foreground">{quotasError}</p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw className="size-4" />}
          onClick={() => void refetch()}
        >
          Try again
        </Button>
      </Card>
    );
  }

  const entries = quotas ? Object.entries(quotas) : [];

  // ── Empty (plan defines no quotas) ─────────────────────────────────────────
  if (entries.length === 0) {
    return (
      <Card padding="lg">
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Gauge className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-medium text-foreground">No quotas on your current plan</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your workspace plan doesn&apos;t meter any limits yet. Quota usage will appear here once
            your plan defines them.
          </p>
        </div>
      </Card>
    );
  }

  // ── Loaded ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <section aria-labelledby="quota-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 id="quota-heading" className="text-sm font-semibold text-foreground">
            Plan limits
          </h2>
          <Tooltip content="How much of each quota your plan includes has been used this billing period.">
            <Info className="size-3.5 text-muted-foreground" aria-hidden />
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Refresh usage"
            onClick={() => void refetch()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map(([slug, usage]) => (
            <QuotaBar key={slug} slug={slug} usage={usage} />
          ))}
        </div>
      </section>

      <RecentActivity logs={logs} loading={logsLoading} error={logsError} />
    </div>
  );
}

function QuotaBar({ slug, usage }: { slug: string; usage: IQuotaUsageStatus }) {
  const meta = metaForSlug(slug);
  const fraction = quotaConsumedFraction(usage);
  const pct = Math.min(100, Math.round(fraction * 100));
  const overagePct =
    usage.included > 0 ? Math.min(100, Math.round((usage.overage / usage.included) * 100)) : 0;

  const barColor = usage.hasOverage
    ? "bg-destructive"
    : usage.available <= 0
      ? "bg-warning"
      : "bg-primary";

  return (
    <Card padding="md" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{meta.label}</span>
          <Tooltip content={meta.description}>
            <Info className="size-3.5 text-muted-foreground" aria-hidden />
          </Tooltip>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {usage.consumed} / {usage.included}
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={usage.included}
        aria-valuenow={usage.consumed}
        aria-label={`${meta.label}: ${usage.consumed} of ${usage.included} used`}
      >
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{Math.max(0, usage.available)}</span>{" "}
          available
        </span>
        {usage.hasOverage && (
          <span className="text-destructive">
            <Tooltip content="Usage beyond your plan's included amount, billed as overage on your next invoice.">
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="size-3" aria-hidden />+{usage.overage} overage
                {overagePct > 0 ? ` (${overagePct}%)` : ""}
              </span>
            </Tooltip>
          </span>
        )}
        {!usage.hasOverage && usage.available <= 0 && usage.allowOverage === false && (
          <span className="text-warning">Limit reached</span>
        )}
      </div>
    </Card>
  );
}

function RecentActivity({
  logs,
  loading,
  error,
}: {
  logs: IUsageLogEntry[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section aria-labelledby="activity-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="activity-heading" className="text-sm font-semibold text-foreground">
          Recent activity
        </h2>
      </div>

      {loading && logs.length === 0 ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load recent activity.</p>
      ) : logs.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
        </Card>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {logs.map((log) => {
              const meta = metaForSlug(log.quotaSlug);
              return (
                <li
                  key={log._id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{meta.label}</span>
                    {log.source ? (
                      <span className="ml-2 text-xs text-muted-foreground">via {log.source}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <span className="tabular-nums text-foreground">+{log.quantity}</span>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={log.createdAt}
                      title={new Date(log.createdAt).toLocaleString()}
                    >
                      {new Date(log.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
