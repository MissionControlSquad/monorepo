"use client";

import { useQuery } from "urql";
import { REVIEW_METRICS_QUERY } from "../../lib/graphql/queries";
import { CheckCircle2, XCircle, MessageCircle } from "lucide-react";
import { ChartCard } from "./ChartCard";
import { useCurrentProject } from "../context/AppContext";

export function ReviewMetricsCard() {
  const { projectId } = useCurrentProject();
  const [metricsResult] = useQuery({
    query: REVIEW_METRICS_QUERY,
    variables: { projectId: projectId ?? undefined },
  });
  const metrics = metricsResult.data?.reviewMetrics;

  return (
    <ChartCard title="Review Metrics" loading={!metrics}>
      {metrics && (
        <div className="grid grid-cols-1 @lg:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-success-muted">
            <CheckCircle2 className="w-5 h-5 text-success" />
            <div>
              <p className="text-lg font-bold text-success">{metrics.approved}</p>
              <p className="text-xs text-success">Approved</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive-muted">
            <XCircle className="w-5 h-5 text-destructive" />
            <div>
              <p className="text-lg font-bold text-destructive">{metrics.rejected}</p>
              <p className="text-xs text-destructive">Rejected</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-warning-muted">
            <MessageCircle className="w-5 h-5 text-warning" />
            <div>
              <p className="text-lg font-bold text-warning">{metrics.clarification}</p>
              <p className="text-xs text-warning">Clarifications</p>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
