import type { WorkSession } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const workSessionModel = new Model<WorkSession>(() => prisma.workSession);
