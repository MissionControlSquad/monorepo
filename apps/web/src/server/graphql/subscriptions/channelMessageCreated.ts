import { builder } from "../builder";
import { prisma } from "../../prisma";
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
      const message = await prisma.channelMessage.findUnique({
        ...query,
        where: { id: payload.messageId },
      });
      if (!message) return null as any;
      return message;
    },
  }),
);
