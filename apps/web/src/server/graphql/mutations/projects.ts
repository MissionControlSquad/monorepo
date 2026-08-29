import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { agentModel, projectModel, projectMemberModel } from "../../models";
import { invalidateProjectsList } from "../../cache";
import { Roles, ProjectStatus, ProjectMemberStatus } from "../../constants";
import { getOrCreateAgentProfileId } from "../../agent-profile";
import { findProfilesWithAgentIdsByIds, findProfileAgentId } from "@agentcenter/database";
import { checkLicenseLimit } from "../../license";
import { requireRole, scoped, recordPlanUsage } from "@/server/tenancy";
import { USAGE_QUOTA_SLUGS } from "@/lib/quota-slugs";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { isProjectSourceType, isProjectVisibility, sourceTypeUsesRepo } from "@agentcenter/utils";

builder.mutationField("createProject", (t) =>
  t.prismaField({
    type: "Project",
    args: {
      name: t.arg.string({ required: true }),
      description: t.arg.string(),
      memberProfileIds: t.arg.stringList(),
      memberIds: t.arg.stringList(),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      // Enforce license limit on project count
      const projectCount = await projectModel.count({ where: { status: ProjectStatus.ACTIVE } });
      const limitCheck = await checkLicenseLimit("projects", projectCount);
      if (!limitCheck.allowed) {
        throw new Error(
          `Project limit reached (${limitCheck.limit}). Upgrade your plan to add more projects.`,
        );
      }

      // Auto-include Squad Lead's profile
      const squadLead = await agentModel.findOne({
        where: { role: Roles.SQUAD_LEAD },
        select: { id: true },
      });
      const squadLeadProfileId = squadLead ? await getOrCreateAgentProfileId(squadLead.id) : null;

      let profileIds: string[];

      if (args.memberProfileIds && args.memberProfileIds.length > 0) {
        // New path: frontend sends profile IDs directly
        profileIds = [
          ...new Set([
            ...args.memberProfileIds,
            ...(squadLeadProfileId ? [squadLeadProfileId] : []),
          ]),
        ];
      } else if (args.memberIds && args.memberIds.length > 0) {
        // Legacy path: agent SDK sends agent IDs
        const allMemberIds = [
          ...new Set([...args.memberIds, ...(squadLead ? [squadLead.id] : [])]),
        ];
        profileIds = await Promise.all(allMemberIds.map((id) => getOrCreateAgentProfileId(id)));
      } else {
        // No members specified, just add Squad Lead
        profileIds = squadLeadProfileId ? [squadLeadProfileId] : [];
      }

      const project = await projectModel.create({
        ...query,
        data: {
          name: args.name,
          description: args.description ?? undefined,
          status: ProjectStatus.ACTIVE,
          members: {
            create: profileIds.map((profileId) => ({ profileId })),
          },
        },
      });

      // Resolve profileIds → agentIds for event/notification compat
      const profiles = await findProfilesWithAgentIdsByIds(profileIds);
      const agentIds = profiles.map((p) => p.agentId!);

      await projectModel.emitCreated(project, {
        memberIds: agentIds,
      });

      invalidateProjectsList();

      // Best-effort: record consumption of the workspace's HUMAN plan `projects` quota in buildbase.
      // This is the human dashboard path (requireRole above); ctx.usage is the buildbase session
      // resolved from the request cookies (null for agent/self-host callers → skipped). Fail-safe +
      // dormant until buildbase is configured; never blocks or breaks the create.
      if (ctx.usage) {
        await recordPlanUsage({
          sessionId: ctx.usage.sessionId,
          workspaceId: ctx.usage.workspaceId,
          quotaSlug: USAGE_QUOTA_SLUGS.projects,
        });
      }

      return project;
    },
  }),
);

builder.mutationField("updateProject", (t) =>
  t.prismaField({
    type: "Project",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      description: t.arg.string(),
      status: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const result = await projectModel.update(args.id, {
        ...query,
        data: {
          ...(args.name ? { name: args.name } : {}),
          ...(args.description !== undefined ? { description: args.description } : {}),
          ...(args.status ? { status: args.status as any } : {}),
        },
      });
      invalidateProjectsList();
      return result;
    },
  }),
);

builder.mutationField("archiveProject", (t) =>
  t.prismaField({
    type: "Project",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const result = await projectModel.update(args.id, {
        ...query,
        data: { status: ProjectStatus.ARCHIVED },
      });
      invalidateProjectsList();
      return result;
    },
  }),
);

builder.mutationField("restoreProject", (t) =>
  t.prismaField({
    type: "Project",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const result = await projectModel.update(args.id, {
        ...query,
        data: { status: ProjectStatus.ACTIVE },
      });
      invalidateProjectsList();
      return result;
    },
  }),
);

// Project source configuration (Paperclip Project Workspace parity). Portable metadata; workspace-
// scoped. repoUrl/repoRef only apply to a remote_repo source — for any other source they're cleared
// so the record stays coherent.
builder.mutationField("setProjectSource", (t) =>
  t.prismaField({
    type: "Project",
    args: {
      projectId: t.arg.string({ required: true }),
      sourceType: t.arg.string(),
      repoUrl: t.arg.string(),
      repoRef: t.arg.string(),
      visibility: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const project = await ctx.prisma.project.findFirst({
        where: scoped(ctx, { id: args.projectId }),
        select: { id: true },
      });
      if (!project)
        throw new GraphQLError("Project not found", { extensions: { code: "NOT_FOUND" } });

      if (args.sourceType != null && !isProjectSourceType(args.sourceType))
        throw new GraphQLError(`Invalid sourceType '${args.sourceType}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      if (args.visibility != null && !isProjectVisibility(args.visibility))
        throw new GraphQLError(`Invalid visibility '${args.visibility}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });

      const usesRepo = sourceTypeUsesRepo(args.sourceType);
      const result = await ctx.prisma.project.update({
        ...query,
        where: { id: project.id },
        data: {
          ...(args.sourceType !== undefined ? { sourceType: args.sourceType } : {}),
          ...(args.visibility != null ? { visibility: args.visibility } : {}),
          // Repo fields are only meaningful for remote_repo; otherwise force them null.
          repoUrl: usesRepo ? (args.repoUrl ?? null) : null,
          repoRef: usesRepo ? (args.repoRef ?? null) : null,
        },
      });
      invalidateProjectsList();
      return result;
    },
  }),
);

builder.mutationField("addProjectMember", (t) =>
  t.prismaField({
    type: "ProjectMember",
    args: {
      projectId: t.arg.string({ required: true }),
      profileId: t.arg.string(),
      agentId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const project = await projectModel.findById(args.projectId, { select: { status: true } });
      if (project?.status === ProjectStatus.ARCHIVED) {
        throw new Error("Cannot modify members of an archived project");
      }

      let resolvedProfileId: string;

      if (args.profileId) {
        resolvedProfileId = args.profileId;
      } else if (args.agentId) {
        resolvedProfileId = await getOrCreateAgentProfileId(args.agentId);
      } else {
        throw new Error("Either profileId or agentId is required");
      }

      const member = await projectMemberModel.delegate.upsert({
        ...query,
        where: {
          projectId_profileId: {
            projectId: args.projectId,
            profileId: resolvedProfileId,
          },
        },
        create: { projectId: args.projectId, profileId: resolvedProfileId },
        update: { status: ProjectStatus.ACTIVE },
      });

      // Look up agent info for events (if this profile is an agent)
      const profile = await findProfileAgentId(resolvedProfileId);

      if (profile?.agentId) {
        const [project, agent] = await Promise.all([
          projectModel.findById(args.projectId, {
            select: { name: true },
          }),
          agentModel.findById(profile.agentId, {
            select: {
              name: true,
              role: true,
              level: true,
              identityEmoji: true,
              username: true,
              personality: true,
            },
          }),
        ]);

        await projectModel.emitMemberAdded({
          projectId: args.projectId,
          projectName: project?.name ?? "",
          agentId: profile.agentId,
          agentName: agent?.name ?? "",
          agentRole: agent?.role,
          agentLevel: agent?.level ?? undefined,
          agentEmoji: agent?.identityEmoji ?? undefined,
          agentUsername: agent?.username ?? undefined,
          agentPersonality: agent?.personality ?? undefined,
        });
      }

      invalidateProjectsList();
      return member;
    },
  }),
);

builder.mutationField("removeProjectMember", (t) =>
  t.field({
    type: "Boolean",
    args: {
      projectId: t.arg.string({ required: true }),
      profileId: t.arg.string(),
      agentId: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const projectForCheck = await projectModel.findById(args.projectId, {
        select: { status: true },
      });
      if (projectForCheck?.status === ProjectStatus.ARCHIVED) {
        throw new Error("Cannot modify members of an archived project");
      }

      let resolvedProfileId: string;
      let resolvedAgentId: string | null = null;

      if (args.profileId) {
        resolvedProfileId = args.profileId;
        // Look up agentId from profile for Squad Lead check
        const profileData = await findProfileAgentId(args.profileId);
        resolvedAgentId = profileData?.agentId ?? null;
      } else if (args.agentId) {
        resolvedAgentId = args.agentId;
        resolvedProfileId = await getOrCreateAgentProfileId(args.agentId);
      } else {
        throw new Error("Either profileId or agentId is required");
      }

      // Prevent removing Squad Lead
      if (resolvedAgentId) {
        const agent = await agentModel.findById(resolvedAgentId, {
          select: { role: true, name: true },
        });
        if (agent?.role === Roles.SQUAD_LEAD) {
          throw new Error("Cannot remove Squad Lead from a project");
        }
      }

      // Soft-delete: mark as deactivated instead of deleting
      await projectMemberModel.delegate.update({
        where: {
          projectId_profileId: {
            projectId: args.projectId,
            profileId: resolvedProfileId,
          },
        },
        data: { status: ProjectMemberStatus.DEACTIVATED },
      });

      const project = await projectModel.findById(args.projectId, {
        select: { name: true },
      });

      if (resolvedAgentId) {
        const agent = await agentModel.findById(resolvedAgentId, {
          select: { name: true },
        });
        await projectModel.emitMemberRemoved({
          projectId: args.projectId,
          projectName: project?.name ?? "",
          agentId: resolvedAgentId,
          agentName: agent?.name ?? "",
        });
      }

      invalidateProjectsList();
      return true;
    },
  }),
);
