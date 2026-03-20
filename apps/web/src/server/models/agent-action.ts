import type { AgentAction } from "@agentcenter/database";
import { agentActionDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const agentActionModel = new Model<AgentAction>(agentActionDelegate);
