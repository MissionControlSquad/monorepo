import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { createRunnerHost, deleteRunnerHost } from "@/server/services/runner-hosts";
import { runCommandOnHost } from "@/server/services/runner-commands";

// Tier D: BYO host management + direct command execution. RUNNERS-gated, admin (arbitrary SSH +
// credential storage). The private key is write-only — accepted here, never returned.
builder.mutationField("createRunnerHost", (t) =>
  t.prismaField({
    type: "RunnerHost",
    args: {
      name: t.arg.string({ required: true }),
      host: t.arg.string({ required: true }),
      port: t.arg.int(),
      username: t.arg.string(),
      privateKey: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      const host = await createRunnerHost({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        host: args.host,
        port: args.port ?? null,
        username: args.username ?? null,
        privateKey: args.privateKey,
        createdByProfileId: tenancy.userId,
      });
      return ctx.prisma.runnerHost.findUniqueOrThrow({ ...query, where: { id: host.id } });
    },
  }),
);

builder.mutationField("deleteRunnerHost", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      return deleteRunnerHost(tenancy.workspaceId, args.id);
    },
  }),
);

builder.mutationField("runCommandOnHost", (t) =>
  t.prismaField({
    type: "RunnerCommand",
    args: {
      hostId: t.arg.string({ required: true }),
      command: t.arg.string({ required: true }),
      cwd: t.arg.string(),
      timeoutMs: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      const cmd = await runCommandOnHost({
        workspaceId: tenancy.workspaceId,
        hostId: args.hostId,
        command: args.command,
        cwd: args.cwd ?? null,
        timeoutMs: args.timeoutMs ?? null,
        requestedByProfileId: tenancy.userId,
      });
      return ctx.prisma.runnerCommand.findUniqueOrThrow({ ...query, where: { id: cmd.id } });
    },
  }),
);
