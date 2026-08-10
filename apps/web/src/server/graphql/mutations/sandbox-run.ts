import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { GraphQLError } from "graphql";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { getSandboxProvider } from "@/server/services/sandbox-providers";
import { runTaskInSandbox, enqueueSandboxRun, cancelAgentRun } from "@/server/services/sandbox-run";
import { promoteAgentRunReview } from "@/server/services/run-review";
import type { RunReviewState } from "@agentcenter/utils";

// Tier D: bind an agent to a sandbox provider (its tasks run inside a provisioned sandbox) and run a
// task in it. RUNNERS-gated, admin (arbitrary code execution + credential use).

builder.mutationField("setAgentSandboxProvider", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      agentId: t.arg.string({ required: true }),
      // A sandbox provider key (local|e2b|daytona|…) or null to clear (run locally on the runner).
      provider: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      if (args.provider && !getSandboxProvider(args.provider)) {
        throw new GraphQLError(`Unknown sandbox provider: ${args.provider}`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const agent = await ctx.prisma.agent.findFirst({
        where: { id: args.agentId, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });
      return ctx.prisma.agent.update({
        ...query,
        where: { id: agent.id },
        data: { sandboxProvider: args.provider ?? null },
      });
    },
  }),
);

// §3 #11 (1): set an agent's per-agent in-flight run cap (maxConcurrentRuns). The sandbox run-queue
// drain never starts a run for an agent already at this many running runs. Pass null to clear (=
// unlimited). RUNNERS-gated, admin. HOW TO USE: setAgentMaxConcurrentRuns(agentId, maxConcurrentRuns:2)
// then enqueue > 2 runs for that agent — the drain keeps at most 2 in-flight; the rest stay queued.
builder.mutationField("setAgentMaxConcurrentRuns", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      agentId: t.arg.string({ required: true }),
      // Positive integer cap, or null to clear (unlimited).
      maxConcurrentRuns: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      if (args.maxConcurrentRuns != null && args.maxConcurrentRuns < 1) {
        throw new GraphQLError(
          "maxConcurrentRuns must be a positive integer (or null for unlimited)",
          {
            extensions: { code: "BAD_USER_INPUT" },
          },
        );
      }
      const agent = await ctx.prisma.agent.findFirst({
        where: { id: args.agentId, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });
      return ctx.prisma.agent.update({
        ...query,
        where: { id: agent.id },
        data: { maxConcurrentRuns: args.maxConcurrentRuns ?? null },
      });
    },
  }),
);

const EnqueuedSandboxRun = builder.simpleObject("EnqueuedSandboxRun", {
  fields: (t) => ({
    runId: t.string(),
    providerKey: t.string(),
  }),
});

// Enqueue a background sandbox run (non-blocking). Returns the AgentRun id immediately; a worker
// executes it. RUNNERS-gated, admin.
builder.mutationField("enqueueTaskInSandbox", (t) =>
  t.field({
    type: EnqueuedSandboxRun,
    args: {
      taskId: t.arg.string({ required: true }),
      agentId: t.arg.string({ required: true }),
      provider: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      return enqueueSandboxRun({
        workspaceId: tenancy.workspaceId,
        taskId: args.taskId,
        agentId: args.agentId,
        providerKey: args.provider ?? undefined,
        requestedByProfileId: tenancy.userId,
      });
    },
  }),
);

// Cancel a run (§3 #2). A QUEUED run is marked canceled so the worker never claims it; a RUNNING run
// executing in this process is TERMINATED via its AbortSignal (child process killed) and finalized
// canceled + reason. RUNNERS-gated, admin (arbitrary code execution + credential use).
builder.mutationField("cancelAgentRun", (t) =>
  t.field({
    type: "Boolean",
    args: {
      runId: t.arg.string({ required: true }),
      // Optional operator-supplied cancellation reason (stored on AgentRun.cancelReason).
      reason: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      return cancelAgentRun(tenancy.workspaceId, args.runId, args.reason ?? undefined);
    },
  }),
);

// Domain 8 G2: a board/admin reviewer promotes (or requests changes on) a quarantined run's output —
// the ONLY path out of `needs_review`. LOW_TRUST_REVIEW-gated, admin.
builder.mutationField("promoteAgentRunReview", (t) =>
  t.prismaField({
    type: "AgentRun",
    args: {
      runId: t.arg.string({ required: true }),
      decision: t.arg.string({ required: true }), // "approved" | "changes_requested"
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LOW_TRUST_REVIEW);
      const tenancy = requireRole(ctx, "admin");
      const run = await promoteAgentRunReview({
        workspaceId: tenancy.workspaceId,
        runId: args.runId,
        decision: args.decision as RunReviewState,
        reviewedByProfileId: tenancy.userId,
      });
      return ctx.prisma.agentRun.findUniqueOrThrow({ ...query, where: { id: run.id } });
    },
  }),
);

const SandboxRunResult = builder.simpleObject("SandboxRunResult", {
  fields: (t) => ({
    runId: t.string(),
    providerKey: t.string(),
    sandboxId: t.string(),
    exitCode: t.int({ nullable: true }),
    stdout: t.string(),
    stderr: t.string(),
    status: t.string(),
  }),
});

builder.mutationField("runTaskInSandbox", (t) =>
  t.field({
    type: SandboxRunResult,
    args: {
      taskId: t.arg.string({ required: true }),
      agentId: t.arg.string({ required: true }),
      // Override the agent's configured provider (e.g. force "local" for a dry run).
      provider: t.arg.string(),
      timeoutMs: t.arg.int(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      // Tenancy is enforced downstream: the agent is workspace-scoped and assembleContextBundle
      // scopes the task to that agent's accessible projects (throws if not accessible).
      return runTaskInSandbox({
        workspaceId: tenancy.workspaceId,
        taskId: args.taskId,
        agentId: args.agentId,
        providerKey: args.provider ?? undefined,
        timeoutMs: args.timeoutMs ?? undefined,
        requestedByProfileId: tenancy.userId,
      });
    },
  }),
);
