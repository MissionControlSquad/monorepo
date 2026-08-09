/**
 * Boardroom prompt assembly + injection defenses (Epic #15). Shared across all apps. Import from
 * @agentcenter/utils. Pure string logic — the web service does persistence and calls these.
 */
export const HISTORY_TURNS = 20;

/** Board message roles — single source of truth (mirrors the BoardRole enum). */
export const BOARD_ROLE = { USER: "user", ASSISTANT: "assistant" } as const;
export const BOARD_ROLES = Object.values(BOARD_ROLE);
export type BoardRole = (typeof BOARD_ROLES)[number];

/** Default board-assistant preamble (Paperclip's fallback when the skill file is absent). */
export const DEFAULT_BOARD_SKILL =
  "You are a board-level assistant helping a human manage their AI-agent company. Help them create " +
  "projects, hire agents, approve tasks, and monitor their organization. Be conversational, " +
  "strategic, and concise.";

/**
 * Serialize a comment body as a tagged conversation turn. Bodies are untrusted: neutralizing
 * `<(/?turn)` keeps each body inside exactly one turn (history-injection defense). Ported verbatim.
 */
export function serializeTurn(role: "user" | "assistant", body: string): string {
  const safeBody = body.replace(/<(\/?turn\b)/gi, "&lt;$1");
  return `<turn role="${role}">\n${safeBody}\n</turn>`;
}

/** Strip structured action signals (`%%ACTIONS%%…%%/ACTIONS%%`) from a reply before persisting. */
export function stripActionSignals(response: string): string {
  return response.replace(/%%ACTIONS%%[\s\S]*?%%\/ACTIONS%%/g, "").trim();
}

/** Pure: last `n` turns, oldest-first, each role-tagged + injection-safe, joined. */
export function assembleHistory(
  messages: { role: "user" | "assistant"; body: string }[],
  n: number = HISTORY_TURNS,
): string {
  return messages
    .slice(-n)
    .map((m) => serializeTurn(m.role, m.body))
    .join("\n\n");
}

/** Pure: assemble the full prompt — skill preamble + tagged history + the new user turn. */
export function buildBoardPrompt(skill: string, history: string, userMessage: string): string {
  return [skill.trim(), history, serializeTurn("user", userMessage)].filter(Boolean).join("\n\n");
}
