import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { GraphQLError } from "graphql";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { getSandboxProvider } from "@/server/services/sandbox-providers";
import { runTaskInSandbox } from "@/server/services/sandbox-run";

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
