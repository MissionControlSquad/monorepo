import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { Prisma } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import {
  setApprovalPolicy,
  deleteApprovalPolicy,
  requestAgentAction,
} from "@/server/services/approval-policies";

// Approval-policy CRUD + enforcement entrypoint. GOVERNANCE-gated. admin manages policies; member+ may
// request a gated agent action (the engine decides allow / require_approval / deny). Workspace-scoped.

builder.mutationField("setApprovalPolicy", (t) =>
  t.prismaField({
    type: "ApprovalPolicy",
    args: {
      id: t.arg.string(),
      name: t.arg.string({ required: true }),
      action: t.arg.string({ required: true }),
      effect: t.arg.string({ required: true }),
      priority: t.arg.int(),
      subject: t.arg({ type: "JSON" }),
      condition: t.arg({ type: "JSON" }),
      enabled: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "admin");
      const saved = await setApprovalPolicy({
        id: args.id ?? null,
        workspaceId: tenancy.workspaceId,
        name: args.name,
        action: args.action,
        effect: args.effect,
        priority: args.priority ?? null,
        subject: (args.subject ?? null) as Prisma.InputJsonValue | null,
        condition: (args.condition ?? null) as Prisma.InputJsonValue | null,
        enabled: args.enabled ?? null,
      });
      return ctx.prisma.approvalPolicy.findUniqueOrThrow({ ...query, where: { id: saved.id } });
    },
  }),
);

builder.mutationField("deleteApprovalPolicy", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "admin");
      return deleteApprovalPolicy(args.id, tenancy.workspaceId);
    },
  }),
);

// Enforcement entrypoint: propose a gated agent action. deny → error; require_approval → creates an
// Approval; allow/default → proceeds (default falls back to the coarse requireAgentApproval knob).
const AgentActionGate = builder.simpleObject("AgentActionGateResult", {
  fields: (t) => ({
    status: t.string(), // allow | require_approval | default
    matchedPolicyId: t.string({ nullable: true }),
    approvalId: t.string({ nullable: true }),
  }),
});

builder.mutationField("requestAgentAction", (t) =>
  t.field({
    type: AgentActionGate,
    args: {
      action: t.arg.string({ required: true }),
      agentId: t.arg.string(),
      costCents: t.arg.int(),
      title: t.arg.string(),
      reason: t.arg.string(),
      taskId: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "member");
      const result = await requestAgentAction({
        workspaceId: tenancy.workspaceId,
        action: args.action,
        agentId: args.agentId ?? null,
        costCents: args.costCents ?? null,
        title: args.title ?? null,
        reason: args.reason ?? null,
        taskId: args.taskId ?? null,
        requestedById: tenancy.userId,
      });
      return {
        status: result.status,
        matchedPolicyId: result.matchedPolicyId || null,
        approvalId: result.status === "require_approval" ? result.approvalId : null,
      };
    },
  }),
);
