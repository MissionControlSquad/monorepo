// Board-authz (Paperclip board authorization). A board PRINCIPAL is a first-class board identity that
// can act in the boardroom; what it MAY do is decided by its role. PURE — no I/O — so it is the tested
// core the boardroom service enforces before persisting a principal-attributed action.

export type BoardPrincipalRole = "chair" | "member" | "observer";

/** Actions a board principal can take in the boardroom. */
export type BoardAction = "read_thread" | "post_message" | "rate_message";

export const BOARD_PRINCIPAL_ROLES: BoardPrincipalRole[] = ["chair", "member", "observer"];

// Role → allowed actions. chair: full; member: participate; observer: read-only.
const ROLE_PERMISSIONS: Record<BoardPrincipalRole, ReadonlySet<BoardAction>> = {
  chair: new Set<BoardAction>(["read_thread", "post_message", "rate_message"]),
  member: new Set<BoardAction>(["read_thread", "post_message", "rate_message"]),
  observer: new Set<BoardAction>(["read_thread"]),
};

/** Normalize an arbitrary stored role string to a known role (unknown → most-restrictive observer). */
export function normalizeBoardRole(role: string | null | undefined): BoardPrincipalRole {
  return (BOARD_PRINCIPAL_ROLES as string[]).includes(role ?? "")
    ? (role as BoardPrincipalRole)
    : "observer";
}

/** Whether a principal with `role` may perform `action` in the boardroom. Unknown role → observer. */
export function canBoardPrincipalAct(role: string | null | undefined, action: BoardAction): boolean {
  return ROLE_PERMISSIONS[normalizeBoardRole(role)].has(action);
}

/** Human-readable summary of a role's permissions (for tooltips / UI). */
export function describeBoardRole(role: BoardPrincipalRole): string {
  switch (role) {
    case "chair":
      return "Chair — full boardroom access: read, post messages, and rate replies.";
    case "member":
      return "Member — can read the board thread, post messages, and rate replies.";
    case "observer":
      return "Observer — read-only access to the board thread; cannot post or rate.";
  }
}
