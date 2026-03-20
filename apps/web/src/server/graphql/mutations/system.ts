import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { isSystemShutdown, setSystemShutdown, setProjectShutdown } from "../../system-settings";
import { activityModel } from "../../models";
import { pubsub, PubSubEvent } from "../../pubsub";
import {
  findProfileForDisplay,
  getProjectStatus,
  findAdminUserById,
  updateAdminUserPassword,
  listAdminUsers,
} from "@agentcenter/database";
import { verifyPassword, hashPassword, revokeAllSessions } from "../../admin-auth";
import { createPasswordResetToken, invalidateAllResetTokens } from "../../password-reset";

const SystemSettingsType = builder.simpleObject("SystemSettings", {
  fields: (t) => ({
    shutdownActive: t.boolean(),
  }),
});

builder.queryField("systemSettings", (t) =>
  t.field({
    type: SystemSettingsType,
    resolve: async () => {
      const active = await isSystemShutdown();
      return { shutdownActive: active };
    },
  }),
);

builder.mutationField("setSystemShutdown", (t) =>
  t.field({
    type: SystemSettingsType,
    args: {
      active: t.arg.boolean({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await setSystemShutdown(args.active);

      // Log activity with who toggled it
      const profileId = ctx.session?.profileId;
      const who = profileId
        ? ((await findProfileForDisplay(profileId))?.displayName ?? "Someone")
        : "Someone";
      const action = args.active ? "activated" : "deactivated";
      const activity = await activityModel.create({
        data: {
          type: "agent_status_changed",
          message: `System shutdown ${action} by ${who}`,
          profileId: profileId ?? undefined,
          metadata: { shutdownActive: args.active },
        },
      });
      pubsub.publish(PubSubEvent.ACTIVITY.CREATED, {
        activityId: activity.id,
        projectId: undefined,
      });

      return { shutdownActive: args.active };
    },
  }),
);

const ProjectShutdownResultType = builder.simpleObject("ProjectShutdownResult", {
  fields: (t) => ({
    projectId: t.string(),
    shutdownActive: t.boolean(),
  }),
});

builder.mutationField("setProjectShutdown", (t) =>
  t.field({
    type: ProjectShutdownResultType,
    args: {
      projectId: t.arg.string({ required: true }),
      active: t.arg.boolean({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await setProjectShutdown(args.projectId, args.active);

      const profileId = ctx.session?.profileId;
      const who = profileId
        ? ((await findProfileForDisplay(profileId))?.displayName ?? "Someone")
        : "Someone";
      const project = await getProjectStatus(args.projectId);
      const action = args.active ? "activated" : "deactivated";
      const activity = await activityModel.create({
        data: {
          type: "agent_status_changed",
          message: `Project shutdown ${action} for "${project?.name ?? args.projectId}" by ${who}`,
          profileId: profileId ?? undefined,
          projectId: args.projectId,
          metadata: { projectShutdownActive: args.active, projectId: args.projectId },
        },
      });
      pubsub.publish(PubSubEvent.ACTIVITY.CREATED, {
        activityId: activity.id,
        projectId: args.projectId,
      });

      return { projectId: args.projectId, shutdownActive: args.active };
    },
  }),
);

// ─── Password Management ────────────────────────────────────────────

const ChangePasswordResultType = builder.simpleObject("ChangePasswordResult", {
  fields: (t) => ({
    success: t.boolean(),
  }),
});

builder.mutationField("changePassword", (t) =>
  t.field({
    type: ChangePasswordResultType,
    args: {
      currentPassword: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.session?.sub) throw new GraphQLError("Authentication required");

      if (args.newPassword.length < 8) {
        throw new GraphQLError("New password must be at least 8 characters");
      }

      const admin = await findAdminUserById(ctx.session.sub);
      if (!admin) throw new GraphQLError("Session expired. Please log in again.");

      const valid = await verifyPassword(args.currentPassword, admin.passwordHash);
      if (!valid) throw new GraphQLError("Current password is incorrect");

      const newHash = await hashPassword(args.newPassword);
      await updateAdminUserPassword(admin.id, newHash);

      await revokeAllSessions(admin.id);
      await invalidateAllResetTokens(admin.id);

      return { success: true };
    },
  }),
);

const ResetLinkResultType = builder.simpleObject("ResetLinkResult", {
  fields: (t) => ({
    resetUrl: t.string(),
    expiresAt: t.field({ type: "DateTime" }),
    targetUsername: t.string(),
  }),
});

builder.mutationField("generatePasswordResetLink", (t) =>
  t.field({
    type: ResetLinkResultType,
    args: {
      adminUserId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.session?.sub) throw new GraphQLError("Authentication required");

      const targetAdmin = await findAdminUserById(args.adminUserId);
      if (!targetAdmin) throw new GraphQLError("Selected admin user not found");

      const { plainToken, expiresAt } = await createPasswordResetToken(
        targetAdmin.id,
        ctx.session.sub,
      );

      const origin = ctx.request.headers.get("origin") || "";
      const resetUrl = `${origin}/reset-password?token=${plainToken}`;

      return {
        resetUrl,
        expiresAt,
        targetUsername: targetAdmin.username,
      };
    },
  }),
);

// ─── Admin Users Query ──────────────────────────────────────────────

const AdminUserType = builder.simpleObject("AdminUser", {
  fields: (t) => ({
    id: t.string(),
    username: t.string(),
    createdAt: t.field({ type: "DateTime" }),
  }),
});

builder.queryField("adminUsers", (t) =>
  t.field({
    type: [AdminUserType],
    resolve: async (_root, _args, ctx) => {
      if (!ctx.session?.sub) throw new GraphQLError("Authentication required");

      return listAdminUsers();
    },
  }),
);
