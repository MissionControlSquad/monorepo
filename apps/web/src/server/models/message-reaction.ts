import type { MessageReaction } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const messageReactionModel = new Model<MessageReaction>(() => prisma.messageReaction);
