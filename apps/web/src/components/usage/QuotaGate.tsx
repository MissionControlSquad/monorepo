"use client";

import { useSaaSAuth, useSaaSWorkspaces, useQuotaUsageStatus } from "@buildbase/sdk/react";
import { ArrowUpRight, Lock } from "lucide-react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { Button } from "@/components/ui";
import { metaForSlug, type UsageQuotaSlug } from "@/lib/quota-slugs";
import { evaluateQuotaGate } from "./quota-gate-logic";

/**
 * Gate a plan-limited CREATE action behind the workspace's HUMAN plan quota (Epic #1).
 *
 * When the workspace is at a HARD plan limit for `slug`, renders a readable "you've reached your
 * plan's limit of N — upgrade to add more" message (with a link to the plan picker) INSTEAD of the
 * wrapped action. Otherwise renders the action unchanged.
 *
 * Degrades gracefully: when buildbase is not configured (provider dormant) or the plan defines no
 * such quota, the action is ALWAYS rendered ungated — preserving current behavior. This is the human
 * plan quota, NOT the AI-agent LLM/run budget (finance.prisma).
 */
export function QuotaGate({
  slug,
  children,
  fallback,
}: {
  slug: UsageQuotaSlug | string;
  children: React.ReactNode;
  /** Optional custom node to render when exhausted; defaults to the built-in upsell. */
  fallback?: React.ReactNode;
}) {
  const ready = useBuildbaseReady();
  // useSaaS* hooks require the provider, which only mounts when ready — guard by not calling them.
  if (!ready) return <>{children}</>;
  return (
    <GateInner slug={slug} fallback={fallback}>
      {children}
    </GateInner>
  );
}

function GateInner({
  slug,
  children,
  fallback,
}: {
  slug: UsageQuotaSlug | string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { currentWorkspace } = useSaaSWorkspaces();
  const { openPlanPicker } = useSaaSAuth();
  const { status, loading } = useQuotaUsageStatus(currentWorkspace?._id, slug);

  const state = evaluateQuotaGate({ ready: true, loading, status });

  if (state !== "exhausted") {
    // unknown / loading / available → never block the action.
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  const meta = metaForSlug(slug);
  const included = status?.included ?? 0;

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-muted/40 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p className="text-foreground">
          You&apos;ve reached your plan&apos;s limit of{" "}
          <span className="font-semibold">
            {included} {meta.unit}
          </span>
          . Upgrade your plan to add more.
        </p>
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowUpRight className="size-4" />}
          onClick={() => openPlanPicker()}
        >
          Upgrade plan
        </Button>
      </div>
    </div>
  );
}
