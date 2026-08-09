import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { ApprovalStatus, ApprovalSubjectType } from "@agentcenter/database";
import { requireRole, scoped } from "@/server/tenancy";

// Epic #3: governance queries — workspace-scoped, GOVERNANCE-gated, member+.
builder.queryField("approvals", (t) =>
  t.prismaField({
    type: ["Approval"],
    args: {
      status: t.arg.string(),
      subjectType: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      requireRole(ctx, "member");
      const where = scoped(ctx, {
        ...(args.status ? { status: args.status as ApprovalStatus } : {}),
        ...(args.subjectType ? { subjectType: args.subjectType as ApprovalSubjectType } : {}),
      });
      return ctx.prisma.approval.findMany({ ...query, where, orderBy: { createdAt: "desc" } });
    },
  }),
);

builder.queryField("approval", (t) =>
  t.prismaField({
    type: "Approval",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      requireRole(ctx, "member");
      return ctx.prisma.approval.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);

builder.queryField("pendingApprovalsForMe", (t) =>
  t.prismaField({
    type: ["Approval"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      requireRole(ctx, "member");
      return ctx.prisma.approval.findMany({
        ...query,
        where: scoped(ctx, { status: "pending" as ApprovalStatus }),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("agentTrustProfile", (t) =>
  t.prismaField({
    type: "AgentTrustProfile",
    nullable: true,
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      requireRole(ctx, "member");
      return ctx.prisma.agentTrustProfile.findFirst({
        ...query,
        where: scoped(ctx, { agentId: args.agentId }),
      });
    },
  }),
);
