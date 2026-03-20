import type { WorkSession } from "@agentcenter/database";
import { workSessionDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const workSessionModel = new Model<WorkSession>(workSessionDelegate);
