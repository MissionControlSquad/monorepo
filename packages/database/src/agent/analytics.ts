/** @agentcenter/database - Agent Analytics Operations
 * Raw SQL analytics queries for agent productivity, workload, and activity heatmaps.
 */

import { prisma } from "../client";

// ─── Productivity ────────────────────────────────────────────────────

/** Tasks assigned per agent (optionally filtered by project). */
export async function getAgentTasksAssignedRaw(projectId?: string | null): Promise<{ agentId: string; count: number }[]> {
  if (projectId) {
    return prisma.$queryRaw`
      SELECT p."agentId", COUNT(*)::int AS count
      FROM task_assignees ta
      JOIN profiles p ON p.id = ta."profileId"
      JOIN tasks t ON t.id = ta."taskId"
      WHERE t."projectId" = ${projectId} AND t."deletedAt" IS NULL AND p."agentId" IS NOT NULL
      GROUP BY p."agentId"
    `;
  }
  return prisma.$queryRaw`
    SELECT p."agentId", COUNT(*)::int AS count
    FROM task_assignees ta
    JOIN profiles p ON p.id = ta."profileId"
    JOIN tasks t ON t.id = ta."taskId"
    WHERE t."deletedAt" IS NULL AND p."agentId" IS NOT NULL
    GROUP BY p."agentId"
  `;
}

/** Tasks completed (status=done) per agent (optionally filtered by project). */
export async function getAgentTasksCompletedRaw(projectId?: string | null): Promise<{ agentId: string; count: number }[]> {
  if (projectId) {
    return prisma.$queryRaw`
      SELECT p."agentId", COUNT(*)::int AS count
      FROM task_assignees ta
      JOIN profiles p ON p.id = ta."profileId"
      JOIN tasks t ON t.id = ta."taskId"
      WHERE t.status = 'done' AND t."projectId" = ${projectId} AND t."deletedAt" IS NULL AND p."agentId" IS NOT NULL
      GROUP BY p."agentId"
    `;
  }
  return prisma.$queryRaw`
    SELECT p."agentId", COUNT(*)::int AS count
    FROM task_assignees ta
    JOIN profiles p ON p.id = ta."profileId"
    JOIN tasks t ON t.id = ta."taskId"
    WHERE t.status = 'done' AND t."deletedAt" IS NULL AND p."agentId" IS NOT NULL
    GROUP BY p."agentId"
  `;
}

/** Deliverables count per agent (optionally filtered by project). */
export async function getAgentDeliverablesRaw(projectId?: string | null): Promise<{ agentId: string; count: number }[]> {
  if (projectId) {
    return prisma.$queryRaw`
      SELECT p."agentId", COUNT(*)::int AS count
      FROM deliverables d
      JOIN profiles p ON p.id = d."profileId"
      WHERE d."projectId" = ${projectId} AND p."agentId" IS NOT NULL
      GROUP BY p."agentId"
    `;
  }
  return prisma.$queryRaw`
    SELECT p."agentId", COUNT(*)::int AS count
    FROM deliverables d
    JOIN profiles p ON p.id = d."profileId"
    WHERE p."agentId" IS NOT NULL
    GROUP BY p."agentId"
  `;
}

/** Total work time per agent (ms) (optionally filtered by project). */
export async function getAgentWorkTimeRaw(projectId?: string | null): Promise<{ agentId: string; total_ms: number }[]> {
  if (projectId) {
    return prisma.$queryRaw`
      SELECT "agentId", COALESCE(SUM(duration), 0)::int AS total_ms
      FROM work_sessions
      WHERE "eventType" IN ('started', 'continued') AND "projectId" = ${projectId}
      GROUP BY "agentId"
    `;
  }
  return prisma.$queryRaw`
    SELECT "agentId", COALESCE(SUM(duration), 0)::int AS total_ms
    FROM work_sessions
    WHERE "eventType" IN ('started', 'continued')
    GROUP BY "agentId"
  `;
}

/** Queue stats per agent (total + completed). */
export async function getAgentQueueStatsRaw(): Promise<{ agentId: string; total: number; done: number }[]> {
  return prisma.$queryRaw`
    SELECT "agentId",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS done
    FROM agent_queue_items
    GROUP BY "agentId"
  `;
}

// ─── Workload ────────────────────────────────────────────────────────

/** Task status distribution per agent (optionally filtered by project). */
export async function getAgentWorkloadRaw(projectId?: string | null): Promise<{ agentId: string; status: string; count: number }[]> {
  if (projectId) {
    return prisma.$queryRaw`
      SELECT p."agentId", t.status, COUNT(*)::int AS count
      FROM task_assignees ta
      JOIN profiles p ON p.id = ta."profileId"
      JOIN tasks t ON t.id = ta."taskId"
      WHERE t."projectId" = ${projectId} AND t."deletedAt" IS NULL AND p."agentId" IS NOT NULL
      GROUP BY p."agentId", t.status
    `;
  }
  return prisma.$queryRaw`
    SELECT p."agentId", t.status, COUNT(*)::int AS count
    FROM task_assignees ta
    JOIN profiles p ON p.id = ta."profileId"
    JOIN tasks t ON t.id = ta."taskId"
    WHERE t."deletedAt" IS NULL AND p."agentId" IS NOT NULL
    GROUP BY p."agentId", t.status
  `;
}

// ─── Heatmap ────────────────────────────────────────────────────────

/** Agent action heatmap (DOW × hour) (optionally filtered by project). */
export async function getAgentActivityHeatmapRaw(since: Date, projectId?: string | null): Promise<{ dow: number; hour: number; count: number }[]> {
  if (projectId) {
    return prisma.$queryRaw`
      SELECT EXTRACT(DOW FROM "timestamp" AT TIME ZONE 'UTC')::int AS dow,
             EXTRACT(HOUR FROM "timestamp" AT TIME ZONE 'UTC')::int AS hour,
             COUNT(*)::int AS count
      FROM agent_actions
      WHERE "timestamp" >= ${since} AND "projectId" = ${projectId}
      GROUP BY dow, hour
    `;
  }
  return prisma.$queryRaw`
    SELECT EXTRACT(DOW FROM "timestamp" AT TIME ZONE 'UTC')::int AS dow,
           EXTRACT(HOUR FROM "timestamp" AT TIME ZONE 'UTC')::int AS hour,
           COUNT(*)::int AS count
    FROM agent_actions
    WHERE "timestamp" >= ${since}
    GROUP BY dow, hour
  `;
}

// ─── Activity Trend ────────────────────────────────────────────────

/** Daily action counts from agent_actions (optionally filtered by project). */
export async function getActivityTrendRaw(since: Date, projectId?: string | null): Promise<{ day: Date; count: number }[]> {
  if (projectId) {
    return prisma.$queryRaw`
      SELECT DATE("timestamp" AT TIME ZONE 'UTC') AS day, COUNT(*)::int AS count
      FROM agent_actions
      WHERE "timestamp" >= ${since} AND "projectId" = ${projectId}
      GROUP BY day
    `;
  }
  return prisma.$queryRaw`
    SELECT DATE("timestamp" AT TIME ZONE 'UTC') AS day, COUNT(*)::int AS count
    FROM agent_actions
    WHERE "timestamp" >= ${since}
    GROUP BY day
  `;
}
