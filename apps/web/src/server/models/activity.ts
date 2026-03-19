import type { Activity } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const activityModel = new Model<Activity>(() => prisma.activity);
