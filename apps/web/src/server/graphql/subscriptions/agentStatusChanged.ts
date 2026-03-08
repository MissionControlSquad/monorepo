import { builder } from "../builder";
import { pubsub, PubSubEvent } from "../../pubsub";
import { agentModel } from "../../models";

builder.subscriptionField("agentStatusChanged", (t) =>
  t.prismaField({
    type: "Agent",
    subscribe: () => pubsub.subscribe(PubSubEvent.AGENT.STATUS_CHANGED),
    resolve: async (query, payload) => {
      const agent = await agentModel.delegate.findUnique({
        ...query,
        where: { id: payload.agentId },
      });
      if (!agent) return null as any;
      return agent;
    },
  }),
);
