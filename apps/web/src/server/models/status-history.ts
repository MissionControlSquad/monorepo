import type { StatusHistory } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const statusHistoryModel = new Model<StatusHistory>(() => prisma.statusHistory);
