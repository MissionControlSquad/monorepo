import type { Notification } from "@agentcenter/database";
import { notificationDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const notificationModel = new Model<Notification>(notificationDelegate);
