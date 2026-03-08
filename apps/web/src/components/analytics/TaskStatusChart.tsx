"use client";

import { useQuery } from "urql";
import { TASK_STATUS_COUNTS_QUERY } from "../../lib/graphql/queries";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { ChartCard } from "./ChartCard";
import { STATUS_COLORS } from "@/lib/chart-colors";

const STATUS_LABELS: Record<string, string> = {
  inbox: "Inbox",
  assigned: "Assigned",
  inProgress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

import { useCurrentProject } from "../context/AppContext";

export function TaskStatusChart() {
  const { projectId } = useCurrentProject();
  const [statusResult] = useQuery({
    query: TASK_STATUS_COUNTS_QUERY,
    variables: { projectId: projectId ?? undefined },
  });
  const statusCounts = statusResult.data?.taskStatusCounts;

  const data = statusCounts
    ? Object.entries(STATUS_LABELS)
        .map(([key, label]) => ({
          name: label,
          value: statusCounts[key as keyof typeof statusCounts] as number,
          key,
        }))
        .filter((d) => d.value > 0)
    : [];

  return (
    <ChartCard title="Task Distribution" loading={!statusCounts}>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No tasks yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              innerRadius={50}
              paddingAngle={2}
            >
              {data.map((entry) => (
                <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [value, "Tasks"]}
              contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
