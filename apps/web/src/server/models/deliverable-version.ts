import type { DeliverableVersion } from "@agentcenter/database";
import { deliverableVersionDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const deliverableVersionModel = new Model<DeliverableVersion>(deliverableVersionDelegate);
