"use client";

import { useQuery } from "urql";
import { AGENT_WORKLOAD_DISTRIBUTION_QUERY } from "../../lib/graphql/queries";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { STATUS_COLORS, CHART_THEME } from "@/lib/chart-colors";

import { useCurrentProject } from "../context/AppContext";
import type { AgentWorkloadEntry } from "@agentcenter/types";

export function AgentWorkloadChart() {
  const { projectId } = useCurrentProject();
  const [workloadResult] = useQuery({
    query: AGENT_WORKLOAD_DISTRIBUTION_QUERY,
    variables: { projectId: projectId ?? undefined },
    requestPolicy: "cache-and-network",
  });
  const workload = workloadResult.data?.agentWorkloadDistribution;

  const data = workload?.map((agent: AgentWorkloadEntry) => ({
    name: agent.agentName,
    Inbox: agent.inbox,
    Assigned: agent.assigned,
    "In Progress": agent.inProgress,
    Review: agent.review,
    Done: agent.done,
    Blocked: agent.blocked,
  }));

  return (
    <ChartCard title="Agent Workload" loading={!workload}>
      {!data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No agents yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: CHART_THEME.tickLight }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: CHART_THEME.tickDark }}
              width={120}
            />
            <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "13px" }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="Inbox" stackId="a" fill={STATUS_COLORS.inbox} />
            <Bar dataKey="Assigned" stackId="a" fill={STATUS_COLORS.assigned} />
            <Bar dataKey="In Progress" stackId="a" fill={STATUS_COLORS.in_progress} />
            <Bar dataKey="Review" stackId="a" fill={STATUS_COLORS.review} />
            <Bar dataKey="Done" stackId="a" fill={STATUS_COLORS.done} />
            <Bar dataKey="Blocked" stackId="a" fill={STATUS_COLORS.blocked} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
