import type { StatusHistory } from "@agentcenter/database";
import { statusHistoryDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const statusHistoryModel = new Model<StatusHistory>(statusHistoryDelegate);
