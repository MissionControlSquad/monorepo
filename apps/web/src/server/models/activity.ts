import type { Activity } from "@agentcenter/database";
import { activityDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const activityModel = new Model<Activity>(activityDelegate);
