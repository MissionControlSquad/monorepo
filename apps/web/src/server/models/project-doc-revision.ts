import type { ProjectDocRevision } from "@agentcenter/database";
import { projectDocRevisionDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const projectDocRevisionModel = new Model<ProjectDocRevision>(projectDocRevisionDelegate);
