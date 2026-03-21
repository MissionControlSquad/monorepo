import type { AdminUser } from "@agentcenter/database";
import { adminUserDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const adminUserModel = new Model<AdminUser>(adminUserDelegate);
