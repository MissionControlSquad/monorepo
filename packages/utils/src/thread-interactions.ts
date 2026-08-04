/**
 * Typed thread interactions (Domain 8 G6.5) — pure vocabulary, shared via @agentcenter/utils. An
 * interaction is a structured ask an agent posts into a task thread (suggest tasks, ask the user
 * questions, request a confirmation) that a human resolves. This module owns the kind/status
 * vocabulary + the resolve transition rule. No I/O.
 */

export const THREAD_INTERACTION_KINDS = [
  "suggest_tasks",
  "ask_user_questions",
  "request_confirmation",
] as const;
export type ThreadInteractionKind = (typeof THREAD_INTERACTION_KINDS)[number];

export function isThreadInteractionKind(v: string): v is ThreadInteractionKind {
  return (THREAD_INTERACTION_KINDS as readonly string[]).includes(v);
}

export const THREAD_INTERACTION_STATUSES = ["pending", "resolved", "dismissed"] as const;
export type ThreadInteractionStatus = (typeof THREAD_INTERACTION_STATUSES)[number];

export function isThreadInteractionStatus(v: string): v is ThreadInteractionStatus {
  return (THREAD_INTERACTION_STATUSES as readonly string[]).includes(v);
}

/** Pure: only a pending interaction can transition (to resolved or dismissed). */
export function canResolveThreadInteraction(
  current: string,
  next: "resolved" | "dismissed",
): boolean {
  return current === "pending" && (next === "resolved" || next === "dismissed");
}

/**
 * Pure: does resolving this interaction unblock the source run? A `request_confirmation` that is
 * resolved (approved) continues the run; the others are informational.
 */
export function resolutionWakesRun(kind: string, status: string): boolean {
  return kind === "request_confirmation" && status === "resolved";
}
