/**
 * Boardroom / board concierge chat (Epic #15). A standing per-workspace conversation between a human
 * operator and a board-level assistant. Ports Paperclip `routes/board-chat.ts` — the portable core:
 * the standing thread, injection-safe prompt assembly, and concierge persistence. The LLM relay is a
 * deferred runtime seam (spec D2); the default `unavailableRelay` keeps the feature end-to-end
 * functional and testable without a live model.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import {
  DEFAULT_BOARD_SKILL,
  assembleHistory,
  buildBoardPrompt,
  stripActionSignals,
} from "@agentcenter/utils";
import type { BoardMessage, BoardThread } from "@agentcenter/database";

// The prompt assembly + injection defenses (serializeTurn/stripActionSignals/assembleHistory/
// buildBoardPrompt) are shared in @agentcenter/utils (web/desktop/mobile). This file is persistence.
export {
  serializeTurn,
  stripActionSignals,
  assembleHistory,
  buildBoardPrompt,
  DEFAULT_BOARD_SKILL,
} from "@agentcenter/utils";

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
 * Operator feedback on an assistant board turn: score +1 (up) / -1 (down) / 0 (clear), optional
 * reason. Only assistant turns are rateable, and only within the caller's workspace thread.
 */
export async function setBoardMessageFeedback(input: {
  workspaceId: string;
  messageId: string;
  score: number;
  reason?: string | null;
}): Promise<BoardMessage> {
  const message = await prisma.boardMessage.findFirst({
    where: { id: input.messageId, thread: { workspaceId: input.workspaceId } },
  });
  if (!message) throw new GraphQLError("Message not found", { extensions: { code: "NOT_FOUND" } });
  if (message.role !== "assistant")
    throw new GraphQLError("Only assistant messages can be rated", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  const score = input.score > 0 ? 1 : input.score < 0 ? -1 : 0;
  return prisma.boardMessage.update({
    where: { id: message.id },
    data: {
      feedbackScore: score === 0 ? null : score,
      feedbackReason: score === 0 ? null : (input.reason ?? null),
    },
  });
}

/**
 * Post a user turn, assemble the injection-safe prompt, call the relay, and persist the assistant
 * reply (action-signals stripped). Returns the two new messages.
 */
export async function sendBoardMessage(
  args: {
    workspaceId: string;
    body: string;
    authorId?: string | null;
    // Attribution: set when a board PRINCIPAL (not a human operator) posts the turn.
    boardPrincipalId?: string | null;
    skill?: string;
  },
  relay: BoardRelay = unavailableRelay,
): Promise<{ userMessage: BoardMessage; assistantMessage: BoardMessage }> {
  const thread = await getOrCreateBoardThread(args.workspaceId);

  const userMessage = await prisma.boardMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      body: args.body,
      authorId: args.authorId ?? null,
      boardPrincipalId: args.boardPrincipalId ?? null,
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
