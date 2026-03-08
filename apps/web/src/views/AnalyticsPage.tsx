"use client";

import { lazy, Suspense } from "react";
import { Breadcrumbs, CardSkeleton, PageLayout } from "../components/ui";
import { ErrorBoundary, PanelErrorFallback } from "../components/common/ErrorBoundary";
import { SummaryStatCards } from "../components/analytics/SummaryStatCards";
import { ReviewMetricsCard } from "../components/analytics/ReviewMetricsCard";

const TaskStatusChart = lazy(() =>
  import("../components/analytics/TaskStatusChart").then((m) => ({ default: m.TaskStatusChart })),
);
const CompletionTrendChart = lazy(() =>
  import("../components/analytics/CompletionTrendChart").then((m) => ({
    default: m.CompletionTrendChart,
  })),
);
const AgentWorkloadChart = lazy(() =>
  import("../components/analytics/AgentWorkloadChart").then((m) => ({
    default: m.AgentWorkloadChart,
  })),
);
const ActivityTrendChart = lazy(() =>
  import("../components/analytics/ActivityTrendChart").then((m) => ({
    default: m.ActivityTrendChart,
  })),
);
const AgentActivityHeatmap = lazy(() =>
  import("../components/analytics/AgentActivityHeatmap").then((m) => ({
    default: m.AgentActivityHeatmap,
  })),
);

export function AnalyticsPage() {
  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Analytics" }]} />
      <SummaryStatCards />

      <Suspense
        fallback={
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
            <CardSkeleton className="h-[340px]" />
            <CardSkeleton className="h-[340px]" />
            <CardSkeleton className="h-[340px]" />
            <CardSkeleton className="h-[340px]" />
          </div>
        }
      >
        <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
          <ErrorBoundary
            fallback={({ resetErrorBoundary, error }) => (
              <PanelErrorFallback label="Task Status" error={error} onRetry={resetErrorBoundary} />
            )}
          >
            <TaskStatusChart />
          </ErrorBoundary>
          <ErrorBoundary
            fallback={({ resetErrorBoundary, error }) => (
              <PanelErrorFallback
                label="Completion Trend"
                error={error}
                onRetry={resetErrorBoundary}
              />
            )}
          >
            <CompletionTrendChart />
          </ErrorBoundary>
          <ErrorBoundary
            fallback={({ resetErrorBoundary, error }) => (
              <PanelErrorFallback
                label="Agent Workload"
                error={error}
                onRetry={resetErrorBoundary}
              />
            )}
          >
            <AgentWorkloadChart />
          </ErrorBoundary>
          <ErrorBoundary
            fallback={({ resetErrorBoundary, error }) => (
              <PanelErrorFallback
                label="Activity Trend"
                error={error}
                onRetry={resetErrorBoundary}
              />
            )}
          >
            <ActivityTrendChart />
          </ErrorBoundary>
        </div>
      </Suspense>

      <Suspense fallback={<CardSkeleton className="h-[340px]" />}>
        <ErrorBoundary
          fallback={({ resetErrorBoundary, error }) => (
            <PanelErrorFallback
              label="Activity Heatmap"
              error={error}
              onRetry={resetErrorBoundary}
            />
          )}
        >
          <AgentActivityHeatmap />
        </ErrorBoundary>
      </Suspense>

      <ErrorBoundary
        fallback={({ resetErrorBoundary, error }) => (
          <PanelErrorFallback label="Review Metrics" error={error} onRetry={resetErrorBoundary} />
        )}
      >
        <ReviewMetricsCard />
      </ErrorBoundary>
    </PageLayout>
  );
}
