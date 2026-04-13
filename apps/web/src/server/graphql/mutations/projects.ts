import { builder } from "../builder";
import { agentModel, projectModel, projectMemberModel } from "../../models";
import { invalidateProjectsList } from "../../cache";
import { Roles, ProjectStatus, ProjectMemberStatus } from "../../constants";
import { getOrCreateAgentProfileId } from "../../agent-profile";
import { findProfilesWithAgentIdsByIds, findProfileAgentId } from "@agentcenter/database";
import { checkLicenseLimit } from "../../license";

builder.mutationField("createProject", (t) =>
  t.prismaField({
    type: "Project",
    args: {
      name: t.arg.string({ required: true }),
      description: t.arg.string(),
      memberProfileIds: t.arg.stringList(),
      memberIds: t.arg.stringList(),
    },
    resolve: async (query, _root, args) => {
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
    resolve: async (query, _root, args) => {
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
    resolve: async (query, _root, args) => {
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
    resolve: async (query, _root, args) => {
      const result = await projectModel.update(args.id, {
        ...query,
        data: { status: ProjectStatus.ACTIVE },
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
    resolve: async (query, _root, args) => {
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
    resolve: async (_root, args) => {
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
