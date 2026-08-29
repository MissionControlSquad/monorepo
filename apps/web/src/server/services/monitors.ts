/**
 * Tier C: workspace health monitors. A monitor is a named threshold over a computed metric,
 * evaluated ON DEMAND (this file counts the current value + compares). The DEFERRED half — a
 * background scheduler that auto-evaluates and fires alerts — needs the excluded execution engine
 * (Tier D). Everything here works without it.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { Monitor } from "@agentcenter/database";
import { isBreached, type MonitorMetric, type MonitorComparator } from "@agentcenter/utils";
import { badRequest } from "./service-errors";

/** Compute a metric's current value for a workspace. Pure reads over existing data — no engine. */
export async function computeMetric(workspaceId: string, metric: MonitorMetric): Promise<number> {
  switch (metric) {
    case "open_budget_incidents":
      return prisma.budgetIncident.count({ where: { workspaceId, status: "open" } });
    case "open_pipeline_cases":
      return prisma.pipelineCase.count({
        where: { pipeline: { workspaceId }, status: { notIn: ["done", "rejected"] } },
      });
    case "active_agents":
      return prisma.agent.count({ where: { workspaceId, setupStatus: "active" } });
    case "disabled_secrets":
      return prisma.secret.count({ where: { workspaceId, status: "disabled" } });
  }
}

export interface MonitorEvaluation {
  monitor: Monitor;
  value: number;
  breached: boolean;
}

/** Evaluate every monitor in a workspace against live data (on-demand). */
export async function evaluateMonitors(workspaceId: string): Promise<MonitorEvaluation[]> {
  const monitors = await prisma.monitor.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    monitors.map(async (monitor) => {
      const value = await computeMetric(workspaceId, monitor.metric);
      return {
        monitor,
        value,
        breached: monitor.isActive && isBreached(value, monitor.comparator, monitor.threshold),
      };
    }),
  );
}

export async function createMonitor(input: {
  workspaceId: string;
  name: string;
  metric: MonitorMetric;
  comparator: MonitorComparator;
  threshold: number;
  createdBy?: string | null;
}): Promise<Monitor> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  if (!Number.isInteger(input.threshold)) badRequest("threshold must be an integer");
  return prisma.monitor.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      metric: input.metric,
      comparator: input.comparator,
      threshold: input.threshold,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function updateMonitor(
  workspaceId: string,
  id: string,
  patch: { name?: string | null; threshold?: number | null; isActive?: boolean | null },
): Promise<Monitor> {
  const existing = await prisma.monitor.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new GraphQLError("Monitor not found", { extensions: { code: "NOT_FOUND" } });
  const name = patch.name?.trim();
  if (patch.name != null && !name) badRequest("name cannot be empty");
  return prisma.monitor.update({
    where: { id: existing.id },
    data: {
      ...(name ? { name } : {}),
      ...(patch.threshold != null ? { threshold: patch.threshold } : {}),
      ...(patch.isActive != null ? { isActive: patch.isActive } : {}),
    },
  });
}

export async function deleteMonitor(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.monitor.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}
