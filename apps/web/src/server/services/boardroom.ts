/**
 * Boardroom / board concierge chat (Epic #15). A standing per-workspace conversation between a human
 * operator and a board-level assistant. Ports Paperclip `routes/board-chat.ts` — the portable core:
 * the standing thread, injection-safe prompt assembly, and concierge persistence. The LLM relay is a
 * deferred runtime seam (spec D2); the default `unavailableRelay` keeps the feature end-to-end
 * functional and testable without a live model.
 */
import { prisma } from "@/server/prisma";
import type { BoardMessage, BoardThread } from "@agentcenter/database";

const HISTORY_TURNS = 20;

/**
 * Default board-assistant preamble (Paperclip's fallback when the skill file is absent). A real
 * deployment can inject a fuller skill via the relay.
 */
export const DEFAULT_BOARD_SKILL =
  "You are a board-level assistant helping a human manage their AI-agent company. Help them create " +
  "projects, hire agents, approve tasks, and monitor their organization. Be conversational, " +
  "strategic, and concise.";

/**
 * Serialize a comment body as a tagged conversation turn. Bodies are untrusted: without structure, a
 * message containing a literal `</turn>`/`<turn>` could fabricate turns in the prompt (history
 * injection). Neutralizing `<(/?turn)` keeps each body inside exactly one turn. Ported verbatim.
 */
export function serializeTurn(role: "user" | "assistant", body: string): string {
  const safeBody = body.replace(/<(\/?turn\b)/gi, "&lt;$1");
  return `<turn role="${role}">\n${safeBody}\n</turn>`;
}

/**
 * Strip structured action signals (`%%ACTIONS%%{...}%%/ACTIONS%%`) from a reply before persisting —
 * they are a UI observer channel and must never enter the durable body. Ported verbatim.
 */
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

export interface BoardRelayInput {
  workspaceId: string;
  skill: string;
  prompt: string;
  userMessage: string;
}
/** The LLM relay seam. A real relay (claude CLI / API) is injected later (spec D2). */
export type BoardRelay = (input: BoardRelayInput) => Promise<string>;

/** Default relay: no model is wired on this instance. Keeps the flow functional + honest. */
export const unavailableRelay: BoardRelay = async () =>
  "The board concierge is not configured on this instance. Conversation is saved, but no assistant " +
  "model is connected yet.";

export async function getOrCreateBoardThread(workspaceId: string): Promise<BoardThread> {
  const existing = await prisma.boardThread.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  // Unique on workspaceId — race-safe via upsert.
  return prisma.boardThread.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });
}

export async function listBoardMessages(workspaceId: string): Promise<BoardMessage[]> {
  const thread = await prisma.boardThread.findUnique({ where: { workspaceId } });
  if (!thread) return [];
  return prisma.boardMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Post a user turn, assemble the injection-safe prompt, call the relay, and persist the assistant
 * reply (action-signals stripped). Returns the two new messages.
 */
export async function sendBoardMessage(
  args: { workspaceId: string; body: string; authorId?: string | null; skill?: string },
  relay: BoardRelay = unavailableRelay,
): Promise<{ userMessage: BoardMessage; assistantMessage: BoardMessage }> {
  const thread = await getOrCreateBoardThread(args.workspaceId);

  const userMessage = await prisma.boardMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      body: args.body,
      authorId: args.authorId ?? null,
    },
  });

  const prior = await prisma.boardMessage.findMany({
    where: { threadId: thread.id, id: { not: userMessage.id } },
    orderBy: { createdAt: "asc" },
  });
  const skill = args.skill ?? DEFAULT_BOARD_SKILL;
  const history = assembleHistory(
    prior.map((m) => ({ role: m.role as "user" | "assistant", body: m.body })),
  );
  const prompt = buildBoardPrompt(skill, history, args.body);

  const reply = await relay({
    workspaceId: args.workspaceId,
    skill,
    prompt,
    userMessage: args.body,
  });

  const assistantMessage = await prisma.boardMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      body: stripActionSignals(reply),
      authorId: null,
    },
  });
  await prisma.boardThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });

  return { userMessage, assistantMessage };
}
