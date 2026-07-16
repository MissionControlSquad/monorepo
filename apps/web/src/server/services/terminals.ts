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
import { getHostSSHConfig } from "./runner-hosts";

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

/**
 * Activate a session from ONLY its id + connect token (no tenancy context) — used by the PTY
 * WebSocket, which authenticates purely by the one-time token. Verifies token + connect-TTL, flips
 * pending → active, and returns the full (token-stripped) session so the relay can resolve the host.
 */
export async function activateTerminalByConnectToken(
  id: string,
  connectToken: string,
  now: Date = new Date(),
): Promise<SafeTerminalSession> {
  const session = await prisma.terminalSession.findFirst({ where: { id } });
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

/**
 * Resolve SSH credentials for a session's target. Targets a BYO RunnerHost in the same workspace,
 * matched by host/IP — its private key is stored (encrypted) so the relay can connect. A host we do
 * not have registered returns null and the relay reports that no credentials are available. (Provision
 * a Hetzner host via `provisionHetznerHost` to get a RunnerHost the terminal can reach.)
 */
export async function resolveTerminalSshConfig(
  session: Pick<SafeTerminalSession, "workspaceId" | "host" | "port" | "username">,
): Promise<import("./ssh").SSHConfig | null> {
  if (!session.host) return null;
  const host = await prisma.runnerHost.findFirst({
    where: { workspaceId: session.workspaceId, host: session.host },
  });
  if (!host) return null;
  const config = getHostSSHConfig(host);
  return {
    ...config,
    port: session.port ?? config.port,
    username: session.username ?? config.username,
  };
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

/**
 * Reap stale terminal sessions (self-healing backstop, run from the reap-stale-work cron):
 *  - `active`/`pending` sessions past their overall `sessionExpiresAt` → `closed` (covers a session
 *    orphaned in `active` because the web process died before its PTY teardown ran).
 *  - `pending` sessions past their one-time `connectExpiresAt` that were never connected → `expired`.
 * Returns how many rows transitioned in each bucket.
 */
export async function reapStaleTerminalSessions(
  now: Date = new Date(),
): Promise<{ closed: number; expired: number }> {
  const closed = await prisma.terminalSession.updateMany({
    where: { status: { in: ["pending", "active"] }, sessionExpiresAt: { lt: now } },
    data: { status: "closed", closedAt: now },
  });
  const expired = await prisma.terminalSession.updateMany({
    where: { status: "pending", connectExpiresAt: { lt: now } },
    data: { status: "expired" },
  });
  return { closed: closed.count, expired: expired.count };
}

export async function listTerminalSessions(workspaceId: string): Promise<SafeTerminalSession[]> {
  const sessions = await prisma.terminalSession.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return sessions.map(stripToken);
}
