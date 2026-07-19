import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  runCommandOnVM,
  cancelRunnerCommand,
  createRunnerCommand,
} from "@/server/services/runner-commands";

// Tier D: runner command writes. RUNNERS-gated, admin manages (arbitrary shell execution).

// Run a raw shell command on a cloud VM via server-side SSH. Persists exit/stdout/stderr.
builder.mutationField("runCommandOnVm", (t) =>
  t.prismaField({
    type: "RunnerCommand",
    args: {
      vmId: t.arg.string({ required: true }),
      command: t.arg.string({ required: true }),
      cwd: t.arg.string(),
      timeoutMs: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      const cmd = await runCommandOnVM({
        workspaceId: tenancy.workspaceId,
        vmId: args.vmId,
        command: args.command,
        cwd: args.cwd ?? null,
        timeoutMs: args.timeoutMs ?? null,
        requestedByProfileId: tenancy.userId,
      });
      return ctx.prisma.runnerCommand.findUniqueOrThrow({ ...query, where: { id: cmd.id } });
    },
  }),
);

// Queue a raw command for an agent's runner daemon to pull (outbound-only / NAT-safe targets).
// The daemon claims it via GET /api/runner/commands and posts the result back.
builder.mutationField("queueAgentCommand", (t) =>
  t.prismaField({
    type: "RunnerCommand",
    args: {
      agentId: t.arg.string({ required: true }),
      command: t.arg.string({ required: true }),
      cwd: t.arg.string(),
      timeoutMs: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      const cmd = await createRunnerCommand({
        workspaceId: tenancy.workspaceId,
        targetKind: "agent",
        targetId: args.agentId,
        command: args.command,
        cwd: args.cwd ?? null,
        timeoutMs: args.timeoutMs ?? null,
        requestedByProfileId: tenancy.userId,
      });
      return ctx.prisma.runnerCommand.findUniqueOrThrow({ ...query, where: { id: cmd.id } });
    },
  }),
);

builder.mutationField("cancelRunnerCommand", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      return cancelRunnerCommand(tenancy.workspaceId, args.id);
    },
  }),
);
