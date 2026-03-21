import { builder } from "../builder";
import { getChannelMessageWithQuery } from "@agentcenter/database";
import { pubsub, channelMessageTopic } from "../../pubsub";

builder.subscriptionField("channelMessageCreated", (t) =>
  t.prismaField({
    type: "ChannelMessage",
    nullable: true,
    args: {
      channelId: t.arg.string({ required: true }),
    },
    subscribe: (_root, args) => pubsub.subscribe(channelMessageTopic(args.channelId)),
    resolve: async (query, payload) => {
      try {
        return await getChannelMessageWithQuery(payload.messageId, query);
      } catch {
        return null as any;
      }
    },
  }),
);
