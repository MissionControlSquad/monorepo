/**
 * Terminals — session lifecycle + audit (Epic #9). Authorizes + records a terminal session into an
 * agent environment over SSH. v1 parses/validates the command, mints a short-lived hashed connect
 * token, and tracks lifecycle — it does NOT open a PTY/SSH stream (deferred, spec D2). Ports Paperclip
 * `environment-custom-image-terminal-sessions.ts` (`parseCustomImageSetupSshCommand`) +
 * `session-workspace-cwd.ts` (`isUnsafeSessionWorkspaceCwd`) verbatim.
 */
import { randomBytes } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { hashApiKey } from "@/server/api-key";
import { parseSshCommand, isUnsafeSessionWorkspaceCwd } from "@agentcenter/utils";
import type { TerminalSession } from "@agentcenter/database";

// The pure SSH parsing, unsafe-cwd guard, and lifecycle-state logic are shared in @agentcenter/utils
// (web/desktop/mobile). This file mints the token + persists. Re-exported for existing importers.
export {
  parseSshCommand,
  isUnsafeSessionWorkspaceCwd,
  terminalSessionState,
  type ParsedSshCommand,
  type TerminalState,
} from "@agentcenter/utils";

const CONNECT_TTL_MS = 5 * 60 * 1000; // token good for 5 min
const SESSION_TTL_MS = 60 * 60 * 1000; // session good for 60 min

export type SafeTerminalSession = Omit<TerminalSession, "connectTokenHash">;
function stripToken(s: TerminalSession): SafeTerminalSession {
  const { connectTokenHash: _h, ...safe } = s;
  void _h;
  return safe;
}

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function openTerminalSession(args: {
  workspaceId: string;
  command: string;
  agentId?: string | null;
  cwd?: string | null;
  label?: string | null;
  createdByProfileId?: string | null;
  now?: Date;
}): Promise<{ session: SafeTerminalSession; connectToken: string }> {
  const ssh = parseSshCommand(args.command);
  if (!ssh) badRequest("Unsupported SSH command shape");
  if (isUnsafeSessionWorkspaceCwd(args.cwd)) badRequest("cwd points at a system directory");
  if (args.agentId) {
    const agent = await prisma.agent.findFirst({
      where: { workspaceId: args.workspaceId, id: args.agentId },
      select: { id: true },
    });
    if (!agent) badRequest("agentId does not reference an agent in this workspace");
  }

  const now = args.now ?? new Date();
  const connectToken = `ts_${randomBytes(32).toString("hex")}`;
  const created = await prisma.terminalSession.create({
    data: {
      workspaceId: args.workspaceId,
      agentId: args.agentId ?? null,
      label: args.label ?? null,
      status: "pending",
      username: ssh.username,
      host: ssh.host,
      port: ssh.port,
      cwd: args.cwd ?? null,
      connectTokenHash: hashApiKey(connectToken),
      connectExpiresAt: new Date(now.getTime() + CONNECT_TTL_MS),
      sessionExpiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      createdByProfileId: args.createdByProfileId ?? null,
    },
  });
  // connectToken surfaced here once — only its hash is stored.
  return { session: stripToken(created), connectToken };
}

/**
 * Verify the one-time connect token and activate the session. Rejects a wrong token or one past its
 * connect-token TTL. (The actual PTY/SSH stream would begin here — deferred, spec D2.)
 */
export async function activateTerminalSession(
  workspaceId: string,
  id: string,
  connectToken: string,
  now: Date = new Date(),
): Promise<SafeTerminalSession> {
  const session = await prisma.terminalSession.findFirst({ where: { workspaceId, id } });
  if (!session) badRequest("Terminal session not found");
  if (session.status !== "pending") badRequest("Session is not awaiting connection");
  if (session.connectExpiresAt.getTime() <= now.getTime()) badRequest("Connect token expired");
  if (session.connectTokenHash !== hashApiKey(connectToken)) badRequest("Invalid connect token");
  const updated = await prisma.terminalSession.update({
    where: { id: session.id },
    data: { status: "active", lastActivityAt: now },
  });
  return stripToken(updated);
}

export async function closeTerminalSession(
  workspaceId: string,
  id: string,
): Promise<SafeTerminalSession> {
  const session = await prisma.terminalSession.findFirst({
    where: { workspaceId, id },
    select: { id: true, closedAt: true },
  });
  if (!session) badRequest("Terminal session not found");
  const updated = await prisma.terminalSession.update({
    where: { id: session.id },
    data: session.closedAt ? {} : { status: "closed", closedAt: new Date() },
  });
  return stripToken(updated);
}

export async function listTerminalSessions(workspaceId: string): Promise<SafeTerminalSession[]> {
  const sessions = await prisma.terminalSession.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return sessions.map(stripToken);
}
