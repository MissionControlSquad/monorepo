import type { TaskTemplate } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const taskTemplateModel = new Model<TaskTemplate>(() => prisma.taskTemplate);
