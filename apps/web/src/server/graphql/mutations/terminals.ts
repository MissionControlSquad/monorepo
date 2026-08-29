import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { openTerminalSession, closeTerminalSession } from "@/server/services/terminals";

// Epic #9: terminal session mutations. admin only (opening a session into an environment is
// privileged); TERMINALS-gated (off by default). No PTY/SSH stream — the session is authorized, not
// connected (spec D2).

// The open result carries the plaintext connect token — the ONLY time it is ever returned.
const OpenedTerminalSession = builder.simpleObject("OpenedTerminalSession", {
  fields: (t) => ({
    id: t.string(),
    host: t.string({ nullable: true }),
    port: t.int({ nullable: true }),
    username: t.string({ nullable: true }),
    connectToken: t.string(),
  }),
});

builder.mutationField("openTerminalSession", (t) =>
  t.field({
    type: OpenedTerminalSession,
    args: {
      command: t.arg.string({ required: true }),
      agentId: t.arg.string(),
      cwd: t.arg.string(),
      label: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TERMINALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const { session, connectToken } = await openTerminalSession({
        workspaceId: tenancy.workspaceId,
        command: args.command,
        agentId: args.agentId ?? null,
        cwd: args.cwd ?? null,
        label: args.label ?? null,
        createdByProfileId: tenancy.userId,
      });
      return {
        id: session.id,
        host: session.host,
        port: session.port,
        username: session.username,
        connectToken,
      };
    },
  }),
);

builder.mutationField("closeTerminalSession", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TERMINALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      await closeTerminalSession(tenancy.workspaceId, args.id);
      return true;
    },
  }),
);
