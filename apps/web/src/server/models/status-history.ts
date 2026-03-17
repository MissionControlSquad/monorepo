import type { StatusHistory } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const statusHistoryModel = new Model<StatusHistory>(() => prisma.statusHistory);
