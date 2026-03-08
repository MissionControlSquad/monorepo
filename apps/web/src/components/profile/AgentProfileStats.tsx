"use client";

import { useQuery } from "urql";
import { AGENT_PROFILE_STATS_QUERY } from "../../lib/graphql/queries";
import { CheckCircle2, FileText, Clock, ListChecks, ClipboardList } from "lucide-react";
import { formatDuration } from "../../lib/formatDuration";
import { Card, CardSkeleton } from "../ui";

interface AgentProfileStatsProps {
  agentId: string;
  projectId?: string;
}

export function AgentProfileStats({ agentId, projectId }: AgentProfileStatsProps) {
  const [result] = useQuery({
    query: AGENT_PROFILE_STATS_QUERY,
    variables: { agentId, projectId },
  });
  const stats = result.data?.agentProfileStats;

  if (!stats) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1 @xl:grid @xl:grid-cols-3 @3xl:grid-cols-5 @xl:overflow-visible">
        {[1, 2, 3, 4, 5].map((i) => (
          <CardSkeleton key={i} className="h-[64px] min-w-[140px] @xl:min-w-0" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Assigned",
      value: stats.tasksAssigned,
      icon: ClipboardList,
      color: "text-indigo-700 bg-indigo-100",
    },
    {
      label: "Completed",
      value: stats.tasksCompleted,
      icon: CheckCircle2,
      color: "text-success bg-success/15",
    },
    {
      label: "Deliverables",
      value: stats.deliverablesCount,
      icon: FileText,
      color: "text-blue-700 bg-blue-100",
    },
    {
      label: "Work Time",
      value: stats.totalWorkTimeMs > 0 ? formatDuration(stats.totalWorkTimeMs) : "—",
      icon: Clock,
      color: "text-purple-700 bg-purple-100",
    },
    {
      label: "Queue Rate",
      value: `${stats.queueCompletionRate}%`,
      icon: ListChecks,
      color: "text-warning bg-warning-muted",
    },
  ];

  return (
    <div className="flex gap-2.5 @xl:gap-3 overflow-x-auto pb-1 @xl:grid @xl:grid-cols-3 @3xl:grid-cols-5 @xl:overflow-visible scrollbar-none">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="px-3 py-2.5 @xl:px-4 @xl:py-3 flex flex-row items-center gap-2.5 @xl:gap-3 min-w-[130px] @xl:min-w-0 flex-shrink-0 @xl:flex-shrink"
        >
          <div
            className={`w-8 h-8 @xl:w-9 @xl:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${card.color}`}
          >
            <card.icon className="w-3.5 h-3.5 @xl:w-4 @xl:h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">{card.label}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-base @xl:text-lg font-bold text-foreground leading-tight">
                {card.value}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
