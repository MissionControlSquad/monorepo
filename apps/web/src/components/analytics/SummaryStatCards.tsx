"use client";

import { useQuery } from "urql";
import { TASK_STATUS_COUNTS_QUERY, TASK_CYCLE_TIMES_QUERY } from "../../lib/graphql/queries";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Clock,
  ListTodo,
  Inbox,
  UserCheck,
  Eye,
} from "lucide-react";
import { formatDuration } from "@agentcenter/utils";
import { useCurrentProject } from "../context/AppContext";
import { Card, CardSkeleton } from "../ui";

export function SummaryStatCards() {
  const { projectId } = useCurrentProject();
  const [statusResult] = useQuery({
    query: TASK_STATUS_COUNTS_QUERY,
    variables: { projectId: projectId ?? undefined },
    requestPolicy: "cache-and-network",
  });
  const [cycleResult] = useQuery({
    query: TASK_CYCLE_TIMES_QUERY,
    variables: { projectId: projectId ?? undefined },
    requestPolicy: "cache-and-network",
  });
  const statusCounts = statusResult.data?.taskStatusCounts;
  const cycleTimes = cycleResult.data?.taskCycleTimes;

  if (!statusCounts || !cycleTimes) {
    return (
      <div className="grid grid-cols-2 @xl:grid-cols-4 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <CardSkeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  const highlights = [
    {
      label: "Total Tasks",
      value: statusCounts.total,
      icon: ListTodo,
      color: "text-foreground bg-muted",
    },
    {
      label: "Avg Cycle Time",
      value: cycleTimes.avgCycleTimeMs > 0 ? formatDuration(cycleTimes.avgCycleTimeMs) : "—",
      icon: Clock,
      color: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900",
    },
  ];

  const statusCards = [
    {
      label: "Inbox",
      value: statusCounts.inbox,
      icon: Inbox,
      color: "text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-800",
    },
    {
      label: "Assigned",
      value: statusCounts.assigned,
      icon: UserCheck,
      color: "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-900",
    },
    {
      label: "In Progress",
      value: statusCounts.inProgress,
      icon: Loader2,
      color: "text-warning bg-warning/15",
    },
    {
      label: "Review",
      value: statusCounts.review,
      icon: Eye,
      color: "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900",
    },
    {
      label: "Completed",
      value: statusCounts.done,
      icon: CheckCircle2,
      color: "text-success bg-success/15",
    },
    {
      label: "Blocked",
      value: statusCounts.blocked,
      icon: AlertTriangle,
      color: "text-destructive bg-destructive/15",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Top row: Total + Cycle Time */}
      <div className="grid grid-cols-2 gap-3">
        {highlights.map((card) => (
          <Card key={card.label} className="p-4 flex flex-row items-center gap-3">
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Status breakdown: 2×3 on mobile, 3×2 on medium, 6×1 on large */}
      <div className="grid grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-6 gap-3">
        {statusCards.map((card) => (
          <Card key={card.label} className="p-3 flex flex-row items-center gap-2.5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.color}`}>
              <card.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">{card.label}</p>
              <p className="text-lg font-semibold text-foreground">{card.value}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
