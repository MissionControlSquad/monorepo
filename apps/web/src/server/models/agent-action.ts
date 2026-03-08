import type { AgentAction } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const agentActionModel = new Model<AgentAction>(() => prisma.agentAction);
