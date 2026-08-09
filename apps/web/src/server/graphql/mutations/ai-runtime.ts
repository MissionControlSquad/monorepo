import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS, getRuntimeTool } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { createRunnerCommand } from "@/server/services/runner-commands";
import {
  buildRunnerInstallCommand,
  coerceOs,
  reportedOsForRunner,
} from "@/server/services/ai-runtime-inventory";

// AI Tools doctor - runner-assisted install. AI_TOOLS + RUNNERS gated, admin only (it enqueues shell
// execution on a machine). We NEVER run install on the control-plane host: we enqueue a RunnerCommand
// (targetKind=agent) that the runner's outbound daemon pulls. The command is the catalog's researched
// recommended install for the runner's OS, wrapped in an idempotent `command -v bin ||` guard.
builder.mutationField("installRuntimeToolViaRunner", (t) =>
  t.prismaField({
    type: "RunnerCommand",
    args: {
      agentId: t.arg.string({ required: true }),
      toolKey: t.arg.string({ required: true }),
      os: t.arg.string(), // optional override; else the runner's last-reported OS, else linux
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AI_TOOLS);
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");

      if (!getRuntimeTool(args.toolKey))
        throw new GraphQLError(`Unknown tool: ${args.toolKey}`, {
          extensions: { code: "BAD_USER_INPUT" },
        });

      // The target runner must be an agent in this workspace (no cross-workspace command).
      const agent = await ctx.prisma.agent.findFirst({
        where: { id: args.agentId, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });

      const os =
        coerceOs(args.os) ??
        (await reportedOsForRunner(tenancy.workspaceId, args.agentId)) ??
        "linux";
      const command = buildRunnerInstallCommand(args.toolKey, os);

      const cmd = await createRunnerCommand({
        workspaceId: tenancy.workspaceId,
        targetKind: "agent",
        targetId: args.agentId,
        command,
        timeoutMs: 600_000, // installers pull binaries; give them room
        requestedByProfileId: tenancy.userId,
      });
      return ctx.prisma.runnerCommand.findUniqueOrThrow({ ...query, where: { id: cmd.id } });
    },
  }),
);
