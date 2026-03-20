import type { StatusHistory } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const statusHistoryModel = new Model<StatusHistory>(() => prisma.statusHistory);
