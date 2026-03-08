import type { Notification } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const notificationModel = new Model<Notification>(() => prisma.notification);
