import { builder } from "../builder";
import { pubsub, messageTopic } from "../../pubsub";
import { messageModel } from "../../models";

builder.subscriptionField("messageCreated", (t) =>
  t.prismaField({
    type: "Message",
    nullable: true,
    args: {
      taskId: t.arg.string({ required: true }),
    },
    subscribe: (_root, args) => pubsub.subscribe(messageTopic(args.taskId)),
    resolve: async (query, payload) => {
      const message = await messageModel.delegate.findUnique({
        ...query,
        where: { id: payload.messageId },
      });
      if (!message) return null as any;
      return message;
    },
  }),
);
