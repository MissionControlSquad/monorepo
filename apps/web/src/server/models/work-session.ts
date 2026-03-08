import type { WorkSession } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const workSessionModel = new Model<WorkSession>(() => prisma.workSession);
