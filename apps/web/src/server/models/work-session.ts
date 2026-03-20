import type { WorkSession } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const workSessionModel = new Model<WorkSession>(() => prisma.workSession);
