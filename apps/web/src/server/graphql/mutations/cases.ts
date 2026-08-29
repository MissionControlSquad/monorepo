import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { CaseState, CaseTaskRole } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  createCase,
  updateCase,
  setCaseStatus,
  linkTaskToCase,
  unlinkTaskFromCase,
  createLabel,
  addCaseLabel,
  removeCaseLabel,
  attachCaseDocument,
} from "@/server/services/cases";

// Epic #17: cases mutations — CASES-gated. Create/update/work is member; label-catalog is admin.
builder.mutationField("createCase", (t) =>
  t.prismaField({
    type: "Case",
    args: {
      title: t.arg.string({ required: true }),
      caseType: t.arg.string({ required: true }),
      summary: t.arg.string(),
      projectId: t.arg.string(),
      parentCaseId: t.arg.string(),
      key: t.arg.string(),
      fields: t.arg({ type: "JSON" }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const c = await createCase({
        workspaceId: tenancy.workspaceId,
        createdByProfileId: tenancy.userId,
        title: args.title,
        caseType: args.caseType,
        summary: args.summary ?? null,
        projectId: args.projectId ?? null,
        parentCaseId: args.parentCaseId ?? null,
        key: args.key ?? null,
        fields: (args.fields as Record<string, unknown>) ?? null,
      });
      return ctx.prisma.case.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);

builder.mutationField("updateCase", (t) =>
  t.prismaField({
    type: "Case",
    args: {
      id: t.arg.string({ required: true }),
      title: t.arg.string(),
      summary: t.arg.string(),
      caseType: t.arg.string(),
      fields: t.arg({ type: "JSON" }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const c = await updateCase(
        tenancy.workspaceId,
        args.id,
        {
          title: args.title ?? null,
          summary: args.summary ?? undefined,
          caseType: args.caseType ?? null,
          fields: (args.fields as Record<string, unknown>) ?? undefined,
        },
        tenancy.userId,
      );
      return ctx.prisma.case.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);

builder.mutationField("setCaseStatus", (t) =>
  t.prismaField({
    type: "Case",
    args: { id: t.arg.string({ required: true }), status: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const c = await setCaseStatus(
        tenancy.workspaceId,
        args.id,
        args.status as CaseState,
        tenancy.userId,
      );
      return ctx.prisma.case.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);

builder.mutationField("linkTaskToCase", (t) =>
  t.prismaField({
    type: "CaseTaskLink",
    args: {
      caseId: t.arg.string({ required: true }),
      taskId: t.arg.string({ required: true }),
      role: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const role = ["origin", "work", "reference"].includes(args.role ?? "")
        ? (args.role as CaseTaskRole)
        : "work";
      const link = await linkTaskToCase({
        workspaceId: tenancy.workspaceId,
        caseId: args.caseId,
        taskId: args.taskId,
        role,
        actorProfileId: tenancy.userId,
      });
      return ctx.prisma.caseTaskLink.findUniqueOrThrow({ ...query, where: { id: link.id } });
    },
  }),
);

builder.mutationField("unlinkTaskFromCase", (t) =>
  t.field({
    type: "Boolean",
    args: { caseId: t.arg.string({ required: true }), taskId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return unlinkTaskFromCase({
        workspaceId: tenancy.workspaceId,
        caseId: args.caseId,
        taskId: args.taskId,
        actorProfileId: tenancy.userId,
      });
    },
  }),
);

builder.mutationField("createLabel", (t) =>
  t.prismaField({
    type: "Label",
    args: { name: t.arg.string({ required: true }), color: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const label = await createLabel(tenancy.workspaceId, args.name, args.color ?? "#888888");
      return ctx.prisma.label.findUniqueOrThrow({ ...query, where: { id: label.id } });
    },
  }),
);

builder.mutationField("addCaseLabel", (t) =>
  t.field({
    type: "Boolean",
    args: { caseId: t.arg.string({ required: true }), labelId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      await addCaseLabel({
        workspaceId: tenancy.workspaceId,
        caseId: args.caseId,
        labelId: args.labelId,
        actorProfileId: tenancy.userId,
      });
      return true;
    },
  }),
);

builder.mutationField("removeCaseLabel", (t) =>
  t.field({
    type: "Boolean",
    args: { caseId: t.arg.string({ required: true }), labelId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return removeCaseLabel({
        workspaceId: tenancy.workspaceId,
        caseId: args.caseId,
        labelId: args.labelId,
        actorProfileId: tenancy.userId,
      });
    },
  }),
);

builder.mutationField("attachCaseDocument", (t) =>
  t.prismaField({
    type: "CaseDocument",
    args: {
      caseId: t.arg.string({ required: true }),
      documentId: t.arg.string({ required: true }),
      key: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const cd = await attachCaseDocument({
        workspaceId: tenancy.workspaceId,
        caseId: args.caseId,
        documentId: args.documentId,
        key: args.key,
        actorProfileId: tenancy.userId,
      });
      return ctx.prisma.caseDocument.findUniqueOrThrow({ ...query, where: { id: cd.id } });
    },
  }),
);
