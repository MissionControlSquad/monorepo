import type { Activity } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const activityModel = new Model<Activity>(() => prisma.activity);
