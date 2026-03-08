import { builder } from "../builder";
import { pubsub, PubSubEvent, agentActionAgentTopic, agentActionProjectTopic } from "../../pubsub";
import { agentActionModel } from "../../models";

builder.subscriptionField("agentActionLogged", (t) =>
  t.prismaField({
    type: "AgentAction",
    nullable: true,
    args: {
      agentId: t.arg.string(),
      projectId: t.arg.string(),
    },
    subscribe: (_root, args) => {
      // Subscribe to the most specific topic available
      if (args.agentId) return pubsub.subscribe(agentActionAgentTopic(args.agentId));
      if (args.projectId) return pubsub.subscribe(agentActionProjectTopic(args.projectId));
      // Fallback: global topic (no filtering arg provided)
      return pubsub.subscribe(PubSubEvent.AGENT.ACTION_LOGGED);
    },
    resolve: async (query, payload) => {
      const action = await agentActionModel.delegate.findUnique({
        ...query,
        where: { id: payload.actionId },
      });
      if (!action) return null as any;
      return action;
    },
  }),
);
