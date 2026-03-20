import type { Notification } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const notificationModel = new Model<Notification>(() => prisma.notification);
