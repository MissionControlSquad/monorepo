import type { MessageReaction } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const messageReactionModel = new Model<MessageReaction>(() => prisma.messageReaction);
