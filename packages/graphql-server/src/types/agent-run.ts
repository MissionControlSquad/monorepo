import { builder } from "../builder";
import { redactQuarantinedText, type SourceTrust } from "@agentcenter/utils";

// Tier D: the run ledger — one row per agent execution (sandbox/runner/…). Output is the run's own
// captured stdout/stderr; exposed to member+ under the RUNNERS gate at the query layer.
//
// Domain 8 G2 containment: a QUARANTINED run's stdout/stderr must not flow verbatim into a higher-trust
// read until a board reviewer promotes it — so these two fields redact until reviewState is `approved`.
builder.prismaObject("AgentRun", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    agentId: t.exposeString("agentId", { nullable: true }),
    taskId: t.exposeString("taskId", { nullable: true }),
    kind: t.exposeString("kind"),
    providerKey: t.exposeString("providerKey", { nullable: true }),
    sandboxId: t.exposeString("sandboxId", { nullable: true }),
    status: t.exposeString("status"),
    exitCode: t.exposeInt("exitCode", { nullable: true }),
    stdout: t.string({
      nullable: true,
      resolve: (run) =>
        redactQuarantinedText(run.sourceTrust as SourceTrust | null, run.reviewState, run.stdout),
    }),
    stderr: t.string({
      nullable: true,
      resolve: (run) =>
        redactQuarantinedText(run.sourceTrust as SourceTrust | null, run.reviewState, run.stderr),
    }),
    errorMessage: t.exposeString("errorMessage", { nullable: true }),
    costCents: t.exposeInt("costCents", { nullable: true }),
    // §3 #2 — cost pricing status ("reported" | "unpriced") + cancellation reason.
    costStatus: t.exposeString("costStatus", { nullable: true }),
    cancelReason: t.exposeString("cancelReason", { nullable: true }),
    // Structured adapter execution result (PR #99 tail) — usage/model + machine-readable outcome.
    usageTokensIn: t.exposeInt("usageTokensIn", { nullable: true }),
    usageTokensOut: t.exposeInt("usageTokensOut", { nullable: true }),
    usageModel: t.exposeString("usageModel", { nullable: true }),
    errorFamily: t.exposeString("errorFamily", { nullable: true }),
    exitReason: t.exposeString("exitReason", { nullable: true }),
    // Domain 8 G2 — untrusted-output review gate.
    reviewState: t.exposeString("reviewState", { nullable: true }),
    sourceTrust: t.expose("sourceTrust", { type: "JSON", nullable: true }),
    reviewedByProfileId: t.exposeString("reviewedByProfileId", { nullable: true }),
    reviewedAt: t.expose("reviewedAt", { type: "DateTime", nullable: true }),
    startedAt: t.expose("startedAt", { type: "DateTime" }),
    finishedAt: t.expose("finishedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
