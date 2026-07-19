import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { ProjectWorkspaceType } from "../queries/execution-workspaces";
import {
  createProjectWorkspace,
  updateProjectWorkspace,
  deleteProjectWorkspace,
} from "@/server/services/execution-workspaces";

// Tier D / Phase 3 (Plan 3): ProjectWorkspace writes. EXECUTION_WORKSPACES-gated, admin.

builder.mutationField("createProjectWorkspace", (t) =>
  t.field({
    type: ProjectWorkspaceType,
    args: {
      projectId: t.arg.string({ required: true }),
      name: t.arg.string({ required: true }),
      repoUrl: t.arg.string(),
      repoRef: t.arg.string(),
      setupCommand: t.arg.string(),
      cleanupCommand: t.arg.string(),
      defaultStrategy: t.arg.string(),
      isPrimary: t.arg.boolean(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXECUTION_WORKSPACES);
      const tenancy = requireRole(ctx, "admin");
      return createProjectWorkspace(
        tenancy.workspaceId,
        {
          projectId: args.projectId,
          name: args.name,
          repoUrl: args.repoUrl ?? null,
          repoRef: args.repoRef ?? null,
          setupCommand: args.setupCommand ?? null,
          cleanupCommand: args.cleanupCommand ?? null,
          defaultStrategy: args.defaultStrategy ?? null,
          isPrimary: args.isPrimary ?? false,
        },
        tenancy.userId,
      );
    },
  }),
);

builder.mutationField("updateProjectWorkspace", (t) =>
  t.field({
    type: ProjectWorkspaceType,
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      repoUrl: t.arg.string(),
      repoRef: t.arg.string(),
      setupCommand: t.arg.string(),
      cleanupCommand: t.arg.string(),
      defaultStrategy: t.arg.string(),
      isPrimary: t.arg.boolean(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXECUTION_WORKSPACES);
      const tenancy = requireRole(ctx, "admin");
      return updateProjectWorkspace(tenancy.workspaceId, args.id, {
        ...(args.name != null ? { name: args.name } : {}),
        ...(args.repoUrl !== undefined ? { repoUrl: args.repoUrl } : {}),
        ...(args.repoRef !== undefined ? { repoRef: args.repoRef } : {}),
        ...(args.setupCommand !== undefined ? { setupCommand: args.setupCommand } : {}),
        ...(args.cleanupCommand !== undefined ? { cleanupCommand: args.cleanupCommand } : {}),
        ...(args.defaultStrategy !== undefined ? { defaultStrategy: args.defaultStrategy } : {}),
        ...(args.isPrimary != null ? { isPrimary: args.isPrimary } : {}),
      });
    },
  }),
);

builder.mutationField("deleteProjectWorkspace", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXECUTION_WORKSPACES);
      const tenancy = requireRole(ctx, "admin");
      return deleteProjectWorkspace(tenancy.workspaceId, args.id);
    },
  }),
);
