import type { ProjectDoc } from "@agentcenter/database";
import { projectDocDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const projectDocModel = new Model<ProjectDoc>(projectDocDelegate);
