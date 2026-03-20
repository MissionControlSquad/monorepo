import type { TaskTemplate } from "@agentcenter/database";
import { taskTemplateDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const taskTemplateModel = new Model<TaskTemplate>(taskTemplateDelegate);
