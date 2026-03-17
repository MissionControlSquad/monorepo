import type { Notification } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const notificationModel = new Model<Notification>(() => prisma.notification);
