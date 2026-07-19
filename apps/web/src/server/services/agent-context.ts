/**
 * Tier D: stateless per-task context assembly.
 *
 * Composes an AgentContextBundle for a single task from data we ALREADY own — the agent's identity,
 * its skills (#10) and instructions (#18), plus the task, its project (with the git ref), and the
 * task's linked deliverables/documents/subtasks. There is NO persistent memory store: the bundle is
 * built fresh each time, so the runner holds nothing between tasks and runs on any platform.
 *
 * Access: the task must be in one of the agent's projects, or be unscoped (projectId null) — the
 * same rule the /api/tasks REST route enforces for agents.
 */
import { prisma } from "@/server/prisma";
import type { AgentContextBundle } from "@agentcenter/types";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";

// REST-shaped error so the route's handleError() renders a 404 (not a 500).
function notFound(message: string): never {
  throw { error: message, status: 404 };
}

/** Project IDs where the agent is an active member (its accessible workspace scope for tasks). */
async function agentProjectIds(agentId: string): Promise<string[]> {
  const profileId = await getOrCreateAgentProfileId(agentId);
  const memberships = await prisma.projectMember.findMany({
    where: { profileId, status: "active", project: { status: "active" } },
    select: { projectId: true },
  });
  return memberships.map((m) => m.projectId);
}

interface AgentLike {
  id: string;
  name: string;
  role: string;
  personality: string | null;
  level: string | null;
}

/** Assemble the context bundle for `taskId`, scoped to what `agent` may access. */
export async function assembleContextBundle(
  agent: AgentLike,
  taskId: string,
): Promise<AgentContextBundle> {
  // Scope the task the same way the agent task list does: the agent's projects, or unscoped tasks.
  const projectIds = await agentProjectIds(agent.id);
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      OR: [{ projectId: { in: projectIds } }, { projectId: null }],
    },
    include: {
      project: true,
      deliverables: { orderBy: { createdAt: "asc" }, take: 50 },
      documents: { orderBy: { createdAt: "asc" }, take: 50 },
      childTasks: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, title: true, status: true },
      },
    },
  });
  if (!task) notFound("Task not found or not accessible to this agent");

  const [instructions, agentSkills] = await Promise.all([
    prisma.agentInstruction.findMany({
      where: { agentId: agent.id },
      orderBy: { fileName: "asc" },
    }),
    prisma.agentSkill.findMany({
      where: { agentId: agent.id },
      include: { skill: true },
    }),
  ]);

  return {
    version: 1,
    agent: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      personality: agent.personality ?? null,
      level: agent.level ?? null,
    },
    instructions: instructions.map((i) => ({ fileName: i.fileName, content: i.content })),
    skills: agentSkills.map((as) => ({
      key: as.skill.key,
      name: as.skill.name,
      description: as.skill.description ?? null,
      markdown: as.skill.markdown,
    })),
    task: {
      id: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority ?? null,
      tags: task.tags,
      parentTaskId: task.parentTaskId ?? null,
    },
    project: task.project
      ? {
          id: task.project.id,
          name: task.project.name,
          description: task.project.description ?? null,
          sourceType: task.project.sourceType ?? null,
          repoUrl: task.project.repoUrl ?? null,
          repoRef: task.project.repoRef ?? null,
        }
      : null,
    deliverables: task.deliverables.map((d) => ({
      id: d.id,
      title: d.title,
      kind: d.kind,
      content: d.content ?? null,
    })),
    documents: task.documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      content: doc.content,
    })),
    subtasks: task.childTasks.map((c) => ({ id: c.id, title: c.title, status: c.status })),
  };
}
