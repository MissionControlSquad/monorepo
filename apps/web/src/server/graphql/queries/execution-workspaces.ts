import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  listProjectWorkspaces,
  listExecutionWorkspaces,
} from "@/server/services/execution-workspaces";

// Tier D / Phase 3 (Plan 3): project workspaces + per-run execution-workspace reads.
// EXECUTION_WORKSPACES-gated, workspace-scoped, member+.

export const ProjectWorkspaceType = builder.simpleObject("ProjectWorkspace", {
  fields: (t) => ({
    id: t.string(),
    projectId: t.string(),
    name: t.string(),
    sourceType: t.string(),
    cwd: t.string({ nullable: true }),
    repoUrl: t.string({ nullable: true }),
    repoRef: t.string({ nullable: true }),
    defaultRef: t.string({ nullable: true }),
    setupCommand: t.string({ nullable: true }),
    cleanupCommand: t.string({ nullable: true }),
    defaultStrategy: t.string({ nullable: true }),
    isPrimary: t.boolean(),
    createdAt: t.field({ type: "DateTime" }),
  }),
});

const WorkspaceOperationType = builder.simpleObject("WorkspaceOperation", {
  fields: (t) => ({
    id: t.string(),
    phase: t.string(),
    command: t.string({ nullable: true }),
    exitCode: t.int({ nullable: true }),
    status: t.string(),
    detail: t.string({ nullable: true }),
    startedAt: t.field({ type: "DateTime" }),
  }),
});

const ExecutionWorkspaceType = builder.simpleObject("ExecutionWorkspace", {
  fields: (t) => ({
    id: t.string(),
    projectId: t.string({ nullable: true }),
    taskId: t.string({ nullable: true }),
    runId: t.string({ nullable: true }),
    strategyType: t.string(),
    name: t.string(),
    status: t.string(),
    repoUrl: t.string({ nullable: true }),
    branchName: t.string({ nullable: true }),
    providerType: t.string(),
    providerRef: t.string({ nullable: true }),
    createdAt: t.field({ type: "DateTime" }),
    operations: t.field({ type: [WorkspaceOperationType] }),
  }),
});

builder.queryField("projectWorkspaces", (t) =>
  t.field({
    type: [ProjectWorkspaceType],
    args: { projectId: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXECUTION_WORKSPACES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listProjectWorkspaces(tenancy.workspaceId, args.projectId);
    },
  }),
);

builder.queryField("executionWorkspaces", (t) =>
  t.field({
    type: [ExecutionWorkspaceType],
    args: { projectId: t.arg.string(), runId: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXECUTION_WORKSPACES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listExecutionWorkspaces(tenancy.workspaceId, {
        projectId: args.projectId,
        runId: args.runId,
      });
    },
  }),
);
