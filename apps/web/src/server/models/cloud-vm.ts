import type { CloudVM } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

class CloudVMModel extends Model<CloudVM> {
  constructor() {
    super(() => prisma.cloudVM);
  }
}

export const cloudVMModel = new CloudVMModel();
