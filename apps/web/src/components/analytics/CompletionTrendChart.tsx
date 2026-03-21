"use client";

import { useQuery } from "urql";
import { TASK_COMPLETION_TREND_QUERY } from "../../lib/graphql/queries";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ChartCard } from "./ChartCard";
import { CHART_THEME } from "@/lib/chart-colors";

import { useCurrentProject } from "../context/AppContext";
import type { TrendPoint } from "@agentcenter/types";

export function CompletionTrendChart() {
  const { projectId } = useCurrentProject();
  const [trendResult] = useQuery({
    query: TASK_COMPLETION_TREND_QUERY,
    variables: { days: 30, projectId: projectId ?? undefined },
    requestPolicy: "cache-and-network",
  });
  const trend = trendResult.data?.taskCompletionTrend;

  const data = trend?.map((d: TrendPoint) => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
  }));

  return (
    <ChartCard title="Tasks Completed (30 days)" loading={!trend}>
      {!data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No data yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="completionGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_THEME.completion} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_THEME.completion} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: CHART_THEME.tickLight }}
              interval="preserveStartEnd"
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: CHART_THEME.tickLight }}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(_, payload) => {
                const item = payload?.[0]?.payload;
                return item ? format(parseISO(item.date), "EEEE, MMM d") : "";
              }}
              contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={CHART_THEME.completion}
              fill="url(#completionGrad)"
              strokeWidth={2}
              name="Completed"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
