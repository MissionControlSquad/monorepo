import type { ProjectMember } from "@agentcenter/database";
import { projectMemberDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const projectMemberModel = new Model<ProjectMember>(projectMemberDelegate);
