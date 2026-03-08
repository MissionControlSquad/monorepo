import type { ProjectDoc } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const projectDocModel = new Model<ProjectDoc>(() => prisma.projectDoc);
