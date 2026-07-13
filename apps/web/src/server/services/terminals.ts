/**
 * Terminals — session lifecycle + audit (Epic #9). Authorizes + records a terminal session into an
 * agent environment over SSH. v1 parses/validates the command, mints a short-lived hashed connect
 * token, and tracks lifecycle — it does NOT open a PTY/SSH stream (deferred, spec D2). Ports Paperclip
 * `environment-custom-image-terminal-sessions.ts` (`parseCustomImageSetupSshCommand`) +
 * `session-workspace-cwd.ts` (`isUnsafeSessionWorkspaceCwd`) verbatim.
 */
import path from "node:path";
import { randomBytes } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { hashApiKey } from "@/server/api-key";
import type { TerminalSession } from "@agentcenter/database";

const CONNECT_TTL_MS = 5 * 60 * 1000; // token good for 5 min
const SESSION_TTL_MS = 60 * 60 * 1000; // session good for 60 min

export interface ParsedSshCommand {
  username: string;
  host: string;
  port: number;
}

// ── Pure SSH-command parsing (verbatim port — injection-safe: only known shapes pass) ──
function parsePort(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : null;
}

function parseDestination(value: string): Pick<ParsedSshCommand, "username" | "host"> | null {
  if (value.startsWith("-")) return null;
  const parts = value.split("@");
  if (parts.length !== 2) return null;
  const [username, host] = parts;
  if (!username || !host) return null;
  if (!/^[^\s@/]+$/.test(username)) return null;
  if (!/^[^\s@/:]+$/.test(host)) return null;
  return { username, host };
}

export function parseSshCommand(command: string): ParsedSshCommand | null {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] !== "ssh") return null;

  if (tokens.length === 2) {
    const destination = parseDestination(tokens[1]!);
    return destination ? { ...destination, port: 22 } : null;
  }

  if (tokens.length !== 4) return null;

  if (tokens[1] === "-p") {
    const port = parsePort(tokens[2]!);
    const destination = parseDestination(tokens[3]!);
    return port && destination ? { ...destination, port } : null;
  }

  if (tokens[2] === "-p") {
    const destination = parseDestination(tokens[1]!);
    const port = parsePort(tokens[3]!);
    return port && destination ? { ...destination, port } : null;
  }

  return null;
}

// ── Pure unsafe-cwd guard (verbatim port) ──
const SESSION_CWD_SYSTEM_ROOTS = new Set([
  "/",
  "/tmp",
  "/var",
  "/var/tmp",
  "/var/run",
  "/usr",
  "/etc",
  "/proc",
  "/sys",
  "/dev",
  "/run",
  "/private",
  "/private/tmp",
]);

export function isUnsafeSessionWorkspaceCwd(cwd: string | null | undefined): boolean {
  const value = typeof cwd === "string" && cwd.trim().length > 0 ? cwd.trim() : null;
  if (!value) return false;
  const normalized = path.normalize(value.replace(/\/+$/, "") || "/");
  return SESSION_CWD_SYSTEM_ROOTS.has(normalized);
}

// ── Pure lifecycle state ──
export type TerminalState = "pending" | "active" | "closed" | "expired";

/** Derive the effective state: a closed session stays closed; a past-its-session-expiry one is expired. */
export function terminalSessionState(
  session: { status: string; sessionExpiresAt: Date; closedAt: Date | null },
  now: Date = new Date(),
): TerminalState {
  if (session.closedAt || session.status === "closed") return "closed";
  if (session.sessionExpiresAt.getTime() <= now.getTime()) return "expired";
  return session.status === "active" ? "active" : "pending";
}

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
