import { builder } from "../builder";
import { getChannelMessageWithQuery } from "@agentcenter/database";
import { pubsub, channelReactionTopic } from "../../pubsub";

builder.subscriptionField("channelMessageReactionChanged", (t) =>
  t.prismaField({
    type: "ChannelMessage",
    nullable: true,
    args: {
      channelId: t.arg.string({ required: true }),
    },
    subscribe: (_root, args) => pubsub.subscribe(channelReactionTopic(args.channelId)),
    resolve: async (query, payload) => {
      try {
        return await getChannelMessageWithQuery(payload.messageId, query);
      } catch {
        return null as any;
      }
    },
  }),
);
