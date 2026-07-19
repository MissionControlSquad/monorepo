import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { ApprovalSubjectType, TrustLevel } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import {
  createApproval,
  decideApproval,
  requestChanges,
  resubmitApproval,
  cancelApproval,
  addComment,
  requestAgentHire,
} from "@/server/services/approvals";
import { setTrustProfile } from "@/server/services/trust";

// Epic #3: governance mutations. Human authz via buildbase role (requireRole); GOVERNANCE-gated.
// NOTE: requestedById/decidedById use ctx.tenancy.userId — in the pre-buildbase bootstrap this IS
// the human's Profile id. When buildbase auth is live, map buildbase userId → Profile.buildbaseUserId.

builder.mutationField("createApproval", (t) =>
  t.prismaField({
    type: "Approval",
    args: {
      subjectType: t.arg.string({ required: true }),
      subjectId: t.arg.string({ required: true }),
      taskId: t.arg.string(),
      title: t.arg.string({ required: true }),
      reason: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "member");
      const created = await createApproval({
        workspaceId: tenancy.workspaceId,
        subjectType: args.subjectType as ApprovalSubjectType,
        subjectId: args.subjectId,
        taskId: args.taskId ?? null,
        title: args.title,
        reason: args.reason ?? null,
        requestedById: tenancy.userId,
      });
      return ctx.prisma.approval.findUniqueOrThrow({ ...query, where: { id: created.id } });
    },
  }),
);

// Domain 14 #3: propose hiring an agent — creates a pending hire_agent approval; approving it
// actually creates the agent (decideApproval fulfils it). GOVERNANCE-gated, member+ may propose.
builder.mutationField("requestAgentHire", (t) =>
  t.prismaField({
    type: "Approval",
    args: {
      name: t.arg.string({ required: true }),
      role: t.arg.string({ required: true }),
      reportsToAgentId: t.arg.string(),
      level: t.arg.string(),
      personality: t.arg.string(),
      reason: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "member");
      const created = await requestAgentHire({
        workspaceId: tenancy.workspaceId,
        spec: {
          name: args.name,
          role: args.role,
          reportsToAgentId: args.reportsToAgentId ?? null,
          level: args.level ?? null,
          personality: args.personality ?? null,
        },
        requestedById: tenancy.userId,
        reason: args.reason ?? null,
      });
      return ctx.prisma.approval.findUniqueOrThrow({ ...query, where: { id: created.id } });
    },
  }),
);

builder.mutationField("approveApproval", (t) =>
  t.prismaField({
    type: "Approval",
    args: { id: t.arg.string({ required: true }), decisionNote: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "admin");
      await decideApproval({
        approvalId: args.id,
        workspaceId: tenancy.workspaceId,
        decision: "approve",
        decidedById: tenancy.userId,
        decisionNote: args.decisionNote ?? null,
      });
      return ctx.prisma.approval.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

builder.mutationField("rejectApproval", (t) =>
  t.prismaField({
    type: "Approval",
    args: { id: t.arg.string({ required: true }), decisionNote: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "admin");
      await decideApproval({
        approvalId: args.id,
        workspaceId: tenancy.workspaceId,
        decision: "reject",
        decidedById: tenancy.userId,
        decisionNote: args.decisionNote ?? null,
      });
      return ctx.prisma.approval.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

builder.mutationField("requestApprovalChanges", (t) =>
  t.prismaField({
    type: "Approval",
    args: { id: t.arg.string({ required: true }), decisionNote: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "admin");
      await requestChanges({
        approvalId: args.id,
        workspaceId: tenancy.workspaceId,
        decidedById: tenancy.userId,
        decisionNote: args.decisionNote ?? null,
      });
      return ctx.prisma.approval.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

builder.mutationField("resubmitApproval", (t) =>
  t.prismaField({
    type: "Approval",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "member");
      await resubmitApproval(args.id, tenancy.workspaceId);
      return ctx.prisma.approval.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

builder.mutationField("cancelApproval", (t) =>
  t.prismaField({
    type: "Approval",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "member");
      await cancelApproval(args.id, tenancy.workspaceId);
      return ctx.prisma.approval.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

builder.mutationField("addApprovalComment", (t) =>
  t.prismaField({
    type: "ApprovalComment",
    args: { approvalId: t.arg.string({ required: true }), body: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "member");
      const comment = await addComment({
        approvalId: args.approvalId,
        workspaceId: tenancy.workspaceId,
        authorProfileId: tenancy.userId,
        body: args.body,
      });
      return ctx.prisma.approvalComment.findUniqueOrThrow({ ...query, where: { id: comment.id } });
    },
  }),
);

builder.mutationField("setAgentTrustProfile", (t) =>
  t.prismaField({
    type: "AgentTrustProfile",
    args: {
      agentId: t.arg.string({ required: true }),
      trustLevel: t.arg.string(),
      lowTrustContainment: t.arg.boolean(),
      requireUntrustedPrReview: t.arg.boolean(),
      autoPromoteWorkProduct: t.arg.boolean(),
      sourceTrustBadge: t.arg.string(),
      changeConsentRequired: t.arg.boolean(),
      executionAllowlist: t.arg.stringList(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "admin");
      await setTrustProfile({
        agentId: args.agentId,
        workspaceId: tenancy.workspaceId,
        trustLevel: (args.trustLevel ?? undefined) as TrustLevel | undefined,
        lowTrustContainment: args.lowTrustContainment ?? undefined,
        requireUntrustedPrReview: args.requireUntrustedPrReview ?? undefined,
        autoPromoteWorkProduct: args.autoPromoteWorkProduct ?? undefined,
        sourceTrustBadge: args.sourceTrustBadge ?? undefined,
        changeConsentRequired: args.changeConsentRequired ?? undefined,
        executionAllowlist: args.executionAllowlist ?? undefined,
      });
      return ctx.prisma.agentTrustProfile.findUniqueOrThrow({
        ...query,
        where: { agentId: args.agentId },
      });
    },
  }),
);
