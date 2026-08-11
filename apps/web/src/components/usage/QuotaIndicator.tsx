"use client";

import { useSaaSWorkspaces, useQuotaUsageStatus } from "@buildbase/sdk/react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { Badge, Tooltip } from "@/components/ui";
import { metaForSlug, type UsageQuotaSlug } from "@/lib/quota-slugs";

/**
 * Compact "3/5 agents" plan-quota indicator with an explanatory tooltip, for placement next to a
 * create button (Epic #1). Renders nothing when buildbase is dormant or the plan defines no such
 * quota — so it never clutters the UI in the un-provisioned case. Human plan quota, not agent budget.
 */
export function QuotaIndicator({ slug }: { slug: UsageQuotaSlug | string }) {
  const ready = useBuildbaseReady();
  if (!ready) return null;
  return <IndicatorInner slug={slug} />;
}

function IndicatorInner({ slug }: { slug: UsageQuotaSlug | string }) {
  const { currentWorkspace } = useSaaSWorkspaces();
  const { status, loading } = useQuotaUsageStatus(currentWorkspace?._id, slug);

  if (loading || !status) return null;

  const meta = metaForSlug(slug);
  const atLimit = status.available <= 0 && status.allowOverage === false;
  const variant = atLimit ? "red" : status.available <= 1 ? "yellow" : "gray";

  return (
    <Tooltip
      content={
        <span>
          <span className="font-medium">{meta.label}:</span> {status.consumed} used of{" "}
          {status.included} included
          {status.hasOverage ? ` (+${status.overage} overage)` : ""}. {meta.description}
        </span>
      }
    >
      <Badge variant={variant} size="sm">
        {status.consumed}/{status.included} {meta.unit}
      </Badge>
    </Tooltip>
  );
}
