import type { AgentAction } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const agentActionModel = new Model<AgentAction>(() => prisma.agentAction);
