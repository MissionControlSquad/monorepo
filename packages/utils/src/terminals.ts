/**
 * Terminals — shared pure SSH parsing + guards (Epic #9). Import from @agentcenter/utils. Injection-safe
 * SSH-command parsing (verbatim port) and a node:path-free unsafe-cwd guard so it's mobile/desktop-safe.
 * The web service does token minting + persistence.
 */
export interface ParsedSshCommand {
  username: string;
  host: string;
  port: number;
}

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

/** Injection-safe: only `ssh user@host` / `ssh -p N user@host` / `ssh user@host -p N` pass. */
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

/** node:path-free POSIX normalize (resolves `.`/`..`, collapses slashes) — enough for the guard. */
function normalizePosix(p: string): string {
  const isAbs = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!isAbs) out.push("..");
    } else out.push(seg);
  }
  const res = (isAbs ? "/" : "") + out.join("/");
  return res === "" ? (isAbs ? "/" : ".") : res;
}

/** Pure: reject a working directory that resolves to a system root. */
export function isUnsafeSessionWorkspaceCwd(cwd: string | null | undefined): boolean {
  const value = typeof cwd === "string" && cwd.trim().length > 0 ? cwd.trim() : null;
  if (!value) return false;
  return SESSION_CWD_SYSTEM_ROOTS.has(normalizePosix(value.replace(/\/+$/, "") || "/"));
}

export const TERMINAL_STATE = {
  PENDING: "pending",
  ACTIVE: "active",
  CLOSED: "closed",
  EXPIRED: "expired",
} as const;
export const TERMINAL_STATES = Object.values(TERMINAL_STATE);
export type TerminalState = (typeof TERMINAL_STATES)[number];

/** Pure: derive the effective state from timestamps + stored status. */
export function terminalSessionState(
  session: { status: string; sessionExpiresAt: Date; closedAt: Date | null },
  now: Date = new Date(),
): TerminalState {
  if (session.closedAt || session.status === TERMINAL_STATE.CLOSED) return TERMINAL_STATE.CLOSED;
  if (session.sessionExpiresAt.getTime() <= now.getTime()) return TERMINAL_STATE.EXPIRED;
  return session.status === TERMINAL_STATE.ACTIVE ? TERMINAL_STATE.ACTIVE : TERMINAL_STATE.PENDING;
}
