// Custom-image setup-session lifecycle (parity #47/#48, pure half). An interactive session that opens a
// terminal into a base sandbox, lets an operator configure it, then snapshots it into a reusable custom
// image. This is the PURE state machine + expiry rule; the SSH/PTY (TerminalSession, exists) and the
// provider snapshot are the infra seams the service wires in.

export const SETUP_SESSION_STATUSES = [
  "active", // terminal open, operator configuring
  "capturing", // snapshot in progress
  "captured", // snapshot succeeded → resultTemplate set (terminal)
  "failed", // snapshot or session errored (terminal)
  "aborted", // operator/reaper cancelled (terminal)
  "expired", // TTL elapsed before capture (terminal)
] as const;
export type SetupSessionStatus = (typeof SETUP_SESSION_STATUSES)[number];

export type SetupSessionAction = "beginCapture" | "captureOk" | "captureFail" | "abort" | "expire";

const TERMINAL = new Set<SetupSessionStatus>(["captured", "failed", "aborted", "expired"]);

export class SetupSessionError extends Error {}

/** True once a session can no longer change state. */
export function isSetupSessionTerminal(status: SetupSessionStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * Apply an action to a setup-session status. Only `active` sessions may begin capture, abort, or expire;
 * only a `capturing` session may settle. Any action on a terminal session throws.
 */
export function setupSessionNext(
  current: SetupSessionStatus,
  action: SetupSessionAction,
): SetupSessionStatus {
  if (isSetupSessionTerminal(current))
    throw new SetupSessionError(`session is ${current} (terminal)`);
  switch (action) {
    case "beginCapture":
      if (current !== "active") throw new SetupSessionError("only an active session can capture");
      return "capturing";
    case "captureOk":
      if (current !== "capturing") throw new SetupSessionError("capture wasn't in progress");
      return "captured";
    case "captureFail":
      if (current !== "capturing") throw new SetupSessionError("capture wasn't in progress");
      return "failed";
    case "abort":
      return "aborted";
    case "expire":
      return "expired";
    default:
      throw new SetupSessionError(`unknown action: ${action as string}`);
  }
}

/** A session is expirable when it is still active and past its TTL. */
export function isSetupSessionExpired(
  status: SetupSessionStatus,
  expiresAt: Date,
  now: number,
): boolean {
  return status === "active" && expiresAt.getTime() <= now;
}
