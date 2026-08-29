/**
 * Tier D / Phase 3 (Plan 3) — project workspaces + per-run execution-workspace recording.
 *
 * ProjectWorkspace: a project's named source (repo/ref + setup/cleanup commands) reused across runs.
 * ExecutionWorkspace: the realized workspace for one run (strategy/branch/provider), recorded for
 * observability. WorkspaceOperation: the phase log (provision/clone/setup/run) with exit codes.
 *
 * Recording is EXECUTION_WORKSPACES-flag-gated at the run seam, so it is purely additive: with the flag
 * off (default), runs behave exactly as before and no rows are written.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { Prisma, ProjectWorkspace, ExecutionWorkspace } from "@agentcenter/database";
import {
  isWorkspaceStrategy,
  resolveEffectiveWorkspaceStrategyType,
  resolveWorkspaceRuntimeConfig,
  type WorkspaceRuntimeConfig,
} from "@agentcenter/utils";
import { badRequest } from "./service-errors";

// ── ProjectWorkspace CRUD ────────────────────────────────────────────────────
export interface ProjectWorkspaceInput {
  projectId: string;
  name: string;
  sourceType?: string;
  cwd?: string | null;
  repoUrl?: string | null;
  repoRef?: string | null;
  defaultRef?: string | null;
  setupCommand?: string | null;
  cleanupCommand?: string | null;
  defaultStrategy?: string | null;
  isPrimary?: boolean;
}

export function listProjectWorkspaces(workspaceId: string, projectId?: string | null) {
  return prisma.projectWorkspace.findMany({
    where: { workspaceId, ...(projectId ? { projectId } : {}) },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function createProjectWorkspace(
  workspaceId: string,
  input: ProjectWorkspaceInput,
  createdByProfileId?: string | null,
): Promise<ProjectWorkspace> {
  const name = input.name?.trim();
  if (!name) badRequest("Workspace name is required");
  if (!input.projectId) badRequest("projectId is required");
  if (input.defaultStrategy && !isWorkspaceStrategy(input.defaultStrategy)) {
    badRequest(`Unknown workspace strategy: ${input.defaultStrategy}`);
  }
  try {
    return await prisma.projectWorkspace.create({
      data: {
        workspaceId,
        projectId: input.projectId,
        name,
        sourceType: input.sourceType ?? "repo",
        cwd: input.cwd ?? null,
        repoUrl: input.repoUrl ?? null,
        repoRef: input.repoRef ?? null,
        defaultRef: input.defaultRef ?? null,
        setupCommand: input.setupCommand ?? null,
        cleanupCommand: input.cleanupCommand ?? null,
        defaultStrategy: input.defaultStrategy ?? null,
        isPrimary: input.isPrimary ?? false,
        createdByProfileId: createdByProfileId ?? null,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      throw new GraphQLError(`A workspace named "${name}" already exists for this project`, {
        extensions: { code: "CONFLICT" },
      });
    }
    throw err;
  }
}

export async function updateProjectWorkspace(
  workspaceId: string,
  id: string,
  input: Partial<ProjectWorkspaceInput>,
): Promise<ProjectWorkspace> {
  const existing = await prisma.projectWorkspace.findFirst({ where: { id, workspaceId } });
  if (!existing)
    throw new GraphQLError("Workspace not found", { extensions: { code: "NOT_FOUND" } });
  if (input.defaultStrategy && !isWorkspaceStrategy(input.defaultStrategy)) {
    badRequest(`Unknown workspace strategy: ${input.defaultStrategy}`);
  }
  const data: Prisma.ProjectWorkspaceUpdateInput = {};
  for (const k of [
    "name",
    "sourceType",
    "cwd",
    "repoUrl",
    "repoRef",
    "defaultRef",
    "setupCommand",
    "cleanupCommand",
    "defaultStrategy",
    "isPrimary",
  ] as const) {
    if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  }
  return prisma.projectWorkspace.update({ where: { id }, data });
}

export async function deleteProjectWorkspace(workspaceId: string, id: string): Promise<boolean> {
  const existing = await prisma.projectWorkspace.findFirst({ where: { id, workspaceId } });
  if (!existing)
    throw new GraphQLError("Workspace not found", { extensions: { code: "NOT_FOUND" } });
  await prisma.projectWorkspace.delete({ where: { id } });
  return true;
}

/** The primary named workspace for a project (drives per-run setup command + default strategy). */
export function getPrimaryProjectWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<ProjectWorkspace | null> {
  return prisma.projectWorkspace.findFirst({
    where: { workspaceId, projectId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

// ── ExecutionWorkspace recording ─────────────────────────────────────────────
export async function recordExecutionWorkspace(input: {
  workspaceId: string;
  projectId?: string | null;
  projectWorkspaceId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  strategyType: string;
  name: string;
  repoUrl?: string | null;
  baseRef?: string | null;
  branchName?: string | null;
  providerType: string;
  providerRef?: string | null;
}): Promise<ExecutionWorkspace> {
  return prisma.executionWorkspace.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      projectWorkspaceId: input.projectWorkspaceId ?? null,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      strategyType: input.strategyType,
      name: input.name,
      repoUrl: input.repoUrl ?? null,
      baseRef: input.baseRef ?? null,
      branchName: input.branchName ?? null,
      providerType: input.providerType,
      providerRef: input.providerRef ?? null,
    },
  });
}

/**
 * Realize the workspace for one run (#133/#149/#175): resolve the effective strategy and concrete
 * placement (cwd/branch) from the project-workspace template, then record the ExecutionWorkspace. The
 * returned runtime config is what the runtime consumes to know WHERE to run (creating the dir/worktree
 * on a host is the infra-blocked half and happens in the runtime, not here). Deterministic: a retry of
 * the same task resolves to the same cwd/branch.
 */
export async function realizeWorkspaceForRun(input: {
  workspaceId: string;
  projectId?: string | null;
  projectWorkspaceId?: string | null;
  taskId?: string | null;
  runId: string;
  driver?: string | null; // environment driver (sandbox forces cloud_sandbox)
  pinnedStrategy?: string | null; // an issue/task pin overriding the project default
  providerType: string;
  providerRef?: string | null;
  branchPrefix?: string | null;
}): Promise<{ executionWorkspace: ExecutionWorkspace; runtime: WorkspaceRuntimeConfig }> {
  const pw = input.projectWorkspaceId
    ? await prisma.projectWorkspace.findFirst({
        where: { id: input.projectWorkspaceId, workspaceId: input.workspaceId },
      })
    : null;

  const strategy = resolveEffectiveWorkspaceStrategyType({
    driver: input.driver,
    projectDefaultStrategy: pw?.defaultStrategy,
    issuePinnedStrategy: input.pinnedStrategy,
  });

  const runtime = resolveWorkspaceRuntimeConfig({
    strategy,
    runId: input.runId,
    taskId: input.taskId,
    basePath: pw?.cwd,
    branchPrefix: input.branchPrefix,
  });

  const executionWorkspace = await recordExecutionWorkspace({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? pw?.projectId ?? null,
    projectWorkspaceId: input.projectWorkspaceId ?? null,
    taskId: input.taskId ?? null,
    runId: input.runId,
    strategyType: strategy,
    name: pw?.name ?? runtime.branchName ?? input.runId,
    repoUrl: pw?.repoUrl ?? null,
    baseRef: pw?.defaultRef ?? pw?.repoRef ?? null,
    branchName: runtime.branchName,
    providerType: input.providerType,
    providerRef: input.providerRef ?? null,
  });

  return { executionWorkspace, runtime };
}

export async function recordWorkspaceOperation(
  executionWorkspaceId: string,
  phase: string,
  opts: {
    command?: string | null;
    exitCode?: number | null;
    status?: string;
    detail?: string | null;
  } = {},
): Promise<void> {
  await prisma.workspaceOperation.create({
    data: {
      executionWorkspaceId,
      phase,
      command: opts.command ?? null,
      exitCode: opts.exitCode ?? null,
      status: opts.status ?? "done",
      detail: opts.detail ? opts.detail.slice(0, 2000) : null,
      finishedAt: new Date(),
    },
  });
}

export async function closeExecutionWorkspace(
  workspaceId: string,
  id: string,
): Promise<ExecutionWorkspace> {
  const existing = await prisma.executionWorkspace.findFirst({ where: { id, workspaceId } });
  if (!existing)
    throw new GraphQLError("Execution workspace not found", { extensions: { code: "NOT_FOUND" } });
  return prisma.executionWorkspace.update({
    where: { id },
    data: { status: "closed", closedAt: new Date() },
  });
}

export function listExecutionWorkspaces(
  workspaceId: string,
  filter: { projectId?: string | null; runId?: string | null } = {},
) {
  return prisma.executionWorkspace.findMany({
    where: {
      workspaceId,
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.runId ? { runId: filter.runId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { operations: { orderBy: { startedAt: "asc" } } },
  });
}
