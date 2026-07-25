import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { createSmokeCase, deleteSmokeCase, runSmokeCase, runSmokeSuite } from "@/server/services/smoke-lab";

const SmokeResult = builder.simpleObject("SmokeResult", {
  fields: (t) => ({ caseId: t.string(), name: t.string(), result: t.string(), expected: t.string(), actual: t.string(), detail: t.string({ nullable: true }) }),
});
const SmokeSuiteResult = builder.simpleObject("SmokeSuiteResult", {
  fields: (t) => ({ passed: t.int(), failed: t.int(), errored: t.int(), results: t.field({ type: [SmokeResult] }) }),
});
builder.mutationField("createSmokeCase", (t) =>
  t.prismaField({ type: "SmokeCase",
    args: { name: t.arg.string({ required: true }), toolName: t.arg.string({ required: true }), expectDecision: t.arg.string({ required: true }), agentId: t.arg.string(), inputText: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => { await requireFeature(FLAG_KEYS.SMOKE_LAB); const tn = requireRole(ctx, "admin");
      return createSmokeCase({ workspaceId: tn.workspaceId, name: args.name, toolName: args.toolName, expectDecision: args.expectDecision, agentId: args.agentId ?? null, inputText: args.inputText ?? null, createdByProfileId: tn.userId }); } }),
);
builder.mutationField("deleteSmokeCase", (t) =>
  t.field({ type: "Boolean", args: { id: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => { await requireFeature(FLAG_KEYS.SMOKE_LAB); const tn = requireRole(ctx, "admin"); return deleteSmokeCase(tn.workspaceId, args.id); } }),
);
builder.mutationField("runSmokeCase", (t) =>
  t.field({ type: SmokeResult, args: { id: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => { await requireFeature(FLAG_KEYS.SMOKE_LAB); const tn = requireRole(ctx, "admin"); return runSmokeCase(tn.workspaceId, args.id); } }),
);
builder.mutationField("runSmokeSuite", (t) =>
  t.field({ type: SmokeSuiteResult, args: {},
    resolve: async (_r, _args, ctx) => { await requireFeature(FLAG_KEYS.SMOKE_LAB); const tn = requireRole(ctx, "admin"); return runSmokeSuite(tn.workspaceId); } }),
);
