import type { MessageReaction } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const messageReactionModel = new Model<MessageReaction>(() => prisma.messageReaction);
