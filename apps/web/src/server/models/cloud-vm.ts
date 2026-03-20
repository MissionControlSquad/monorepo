import type { CloudVM } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

class CloudVMModel extends Model<CloudVM> {
  constructor() {
    super(() => prisma.cloudVM);
  }
}

export const cloudVMModel = new CloudVMModel();
