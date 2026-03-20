import type { Subscription } from "@agentcenter/database";
import { subscriptionDelegate } from "@agentcenter/database";
import { Model } from "./base";

export const subscriptionModel = new Model<Subscription>(subscriptionDelegate);
