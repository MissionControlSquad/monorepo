import type { CloudVM } from "@agentcenter/database";
import { cloudVMDelegate } from "@agentcenter/database";
import { Model } from "./base";

class CloudVMModel extends Model<CloudVM> {
  constructor() {
    super(cloudVMDelegate);
  }
}

export const cloudVMModel = new CloudVMModel();
