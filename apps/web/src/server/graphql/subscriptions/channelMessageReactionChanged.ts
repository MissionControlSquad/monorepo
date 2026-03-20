import { builder } from "../builder";
import { prisma } from "@agentcenter/database";
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
      const message = await prisma.channelMessage.findUnique({
        ...query,
        where: { id: payload.messageId },
      });
      if (!message) return null as any;
      return message;
    },
  }),
);
