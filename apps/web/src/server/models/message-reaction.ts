import type { MessageReaction } from "@agentcenter/database";
import { messageReactionDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const messageReactionModel = new Model<MessageReaction>(messageReactionDelegate);
